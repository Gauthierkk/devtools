# Distribution & Update Plan

This document covers two things:

1. **Homebrew cask** — so users can install DevTools with `brew install --cask devtools`
2. **Over-the-air updates** — three approaches, compared, so the right one can be chosen before
   implementation begins

---

## Prerequisites (required by everything below)

Before a cask or any update mechanism can work, three infrastructure pieces must exist.

### Code signing + notarization

macOS Gatekeeper will block any `.app` or `.dmg` that is not signed and notarized. This is
non-negotiable for distribution outside the App Store.

Required:
- An **Apple Developer account** (paid, $99/yr)
- A **Developer ID Application** certificate exported as a `.p12` + password
- An **App Store Connect API key** (for `notarytool` via CI)
- The bundle identifier in `tauri.conf.json` (`com.devtools.studio`) must be consistent and
  registered

### GitHub Releases as the artifact host

All three update approaches below assume `.dmg` artifacts are uploaded to GitHub Releases.
The release workflow must:

1. Build `npx tauri build` (production, not `--debug`)
2. Sign and notarize the `.dmg`
3. Create a GitHub Release tagged `v<version>` and upload the `.dmg` + its `sha256` checksum

The version in `tauri.conf.json`, `Cargo.toml`, and `package.json` must all agree and be bumped
before each release.

### CI/CD pipeline (GitHub Actions)

A workflow at `.github/workflows/release.yml` should trigger on `push: tags: ["v*"]` and run the
build + sign + notarize + publish steps. The signing credentials live as GitHub Actions secrets.
The Python sidecar binary (`devtools-backend`) must also be built and bundled in the same workflow.

---

## 1. Homebrew Cask

A Homebrew cask is a plain Ruby file that tells Homebrew where to download an app, what its
checksum is, and how to install it.

### How it works

```ruby
# Formula/devtools.rb  (lives in a GitHub tap repo, e.g. your-org/homebrew-tap)
cask "devtools" do
  version "1.0.0"
  sha256 "abc123..."     # sha256 of the .dmg

  url "https://github.com/<org>/devtools/releases/download/v#{version}/DevTools_#{version}.dmg"
  name "DevTools"
  desc "Modular developer tools"
  homepage "https://github.com/<org>/devtools"

  app "DevTools.app"
end
```

Users install with:
```
brew tap <org>/tap
brew install --cask devtools
```

Or, once submitted to `homebrew/cask-versions` or the main `homebrew/cask` tap, simply:
```
brew install --cask devtools
```

### What needs to happen

1. **Create a tap repository** — a GitHub repo named `homebrew-tap` under the org. This is the
   simplest first step and does not require Apple approval.
2. **Write the cask formula** — the Ruby file above, initially pointing to the first signed release.
3. **Automate formula updates** — after each GitHub Release, a CI step (or a small script) must
   update the `version` and `sha256` in the cask file and commit it to the tap repo. Tools like
   `brew bump-cask-pr` or a hand-rolled script work here.
4. **Optional: submit to homebrew/cask** — once the app is stable, it can be submitted to the
   official tap for discoverability. Requirements: must be notable, signed, notarized, and have a
   stable release cadence.

### What `brew upgrade` gives you for free

If a user installed via cask, `brew upgrade --cask devtools` (or `brew upgrade` with greedy) will
pull the latest version as long as the cask formula is kept up to date. This is effectively a
CLI-driven update path at no extra implementation cost.

---

## 2. OTA Update Approaches

### Option A — Tauri's built-in updater plugin

**How it works:**

`tauri-plugin-updater` is Tauri's first-party update solution. When enabled, the app can check a
JSON endpoint for a newer version, download a signed update bundle (`.tar.gz` for macOS), and
apply it — all without the user leaving the app.

**What the user sees:** a dialog or banner in the app UI saying "Version X.X is available —
update now." One click downloads and applies the update; the app relaunches.

**What needs to be built:**

1. Add `tauri-plugin-updater` to `Cargo.toml` and `@tauri-apps/plugin-updater` to `package.json`.
2. Configure the updater endpoint in `tauri.conf.json`:
   ```json
   "plugins": {
     "updater": {
       "endpoints": ["https://github.com/<org>/devtools/releases/latest/download/update.json"],
       "dialog": false
     }
   }
   ```
3. On each release, publish an `update.json` manifest alongside the `.dmg`:
   ```json
   {
     "version": "1.1.0",
     "notes": "Bug fixes and improvements",
     "pub_date": "2026-03-04T00:00:00Z",
     "platforms": {
       "darwin-aarch64": { "url": "...", "signature": "..." },
       "darwin-x86_64":  { "url": "...", "signature": "..." }
     }
   }
   ```
4. Add a Rust signing keypair (generated with `tauri signer generate`). The private key is a CI
   secret; the public key goes into `tauri.conf.json`. Every update bundle must be signed with it.
5. In the frontend, add a UI element (e.g. a menu item or settings panel) that calls the updater
   API to check for and apply updates. The plugin exposes this as a JavaScript API.

**Pros:**
- Native in-app experience; no terminal required
- Differential/targeted updates possible
- First-party, well-documented

**Cons:**
- Requires maintaining the update manifest alongside every release
- Signing the update bundle is separate from notarizing the `.dmg` — two key management concerns
- Update is applied as a `.tar.gz` overlay; if the Python sidecar binary changes between versions,
  care is needed to ensure the external binary is also replaced correctly

---

### Option B — Homebrew as the sole update mechanism (no in-app UI)

**How it works:**

No OTA code in the app at all. Users who installed via Homebrew cask update via:
```sh
brew upgrade --cask devtools
```

The app can optionally detect it was installed via Homebrew (check if its path is under
`/opt/homebrew/` or `/usr/local/`) and show a hint in the UI: "To update, run
`brew upgrade --cask devtools`".

**What needs to be built:**

1. Everything in §1 (Homebrew cask + CI automation to keep the formula version current).
2. Optionally: a version-check against GitHub Releases API on startup that shows a non-blocking
   banner: "Version X.X is available. Run `brew upgrade --cask devtools` to update."

**Pros:**
- Near-zero implementation cost beyond the cask itself
- Homebrew handles download integrity (checksum) and rollback (`brew reinstall`)
- Power users already use `brew upgrade` for everything — no new habit to form

**Cons:**
- Requires the user to be in a terminal
- No update path for users who installed by dragging the `.app` from a `.dmg` directly
- `brew upgrade --greedy` or the `autoupdate` cask is opt-in; most users won't get automatic updates

---

### Option C — Lightweight GitHub release polling with in-app prompt

**How it works:**

The app periodically checks the GitHub Releases API for the latest tag, compares it to the bundled
version, and shows a non-modal banner if a newer version exists. Clicking the banner opens the
`.dmg` download URL in the system browser. The user downloads and installs manually (drag-replace).

**What needs to be built:**

1. A small Rust or Python function that hits
   `https://api.github.com/repos/<org>/devtools/releases/latest` and extracts the tag name.
2. Compare against the version embedded at build time (available via `tauri::VERSION` or an env
   var set in the CI build).
3. Expose this as an RPC method (`updater.check`) so the frontend can call it on a timer or on
   demand.
4. A dismissible banner component in the React shell that appears when a newer version is detected,
   with a "Download" button that calls `open` to the release URL.

**Pros:**
- No signing keypair management beyond what notarization already requires
- Works for users who installed via `.dmg` drag-install, not just Homebrew
- Trivial to implement — the check is a single HTTP call; the install is the user's problem
- No update manifest to maintain; GitHub Releases is the source of truth

**Cons:**
- Not truly "over the air" — user still has to drag-replace the `.app` themselves
- No progress indicator or automatic restart
- Hits the GitHub API (rate-limited to 60 req/hr unauthenticated; fine for version checks)

---

## Comparison

| | Tauri updater (A) | Homebrew only (B) | GitHub polling + browser (C) |
|---|---|---|---|
| In-app UI | Yes, full | Hint only | Banner + browser redirect |
| Zero-click install | Yes | No | No |
| Works for drag-install users | Yes | No | Yes |
| Extra signing requirements | Yes (update keypair) | No | No |
| Manifest to maintain per release | Yes | No | No |
| Implementation effort | High | Low | Low |
| Homebrew cask required | No | Yes | No (but recommended) |

---

## Recommended approach

**Ship B + C together as the v1 distribution story, with A as a future enhancement.**

Rationale:

- The cask (B) gives power users `brew install` and `brew upgrade` for free, and its CI automation
  is a prerequisite for any of the other approaches anyway.
- The GitHub polling banner (C) is very cheap to add and covers users who installed via `.dmg`
  directly, without introducing a new signing keypair or update manifest infrastructure.
- The Tauri updater (A) is the right long-term answer once the release cadence is established, the
  signing infrastructure is mature, and the sidecar binary update flow is tested. It can be layered
  on top of B+C later without removing anything.

**Implementation order:**

1. Code signing + notarization setup (prerequisite for everything)
2. GitHub Actions release workflow (build → sign → notarize → publish `.dmg` + checksum)
3. Homebrew tap + cask formula + automated formula bumper (Option B)
4. GitHub release polling + in-app banner (Option C)
5. *(later)* Tauri updater plugin + update manifest in release workflow (Option A)
