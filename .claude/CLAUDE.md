# DevTools

Modular macOS-first desktop app: Tauri v2 (Rust shell) + React/TypeScript frontend + Python sidecar backend.

## Project Structure

- `src/` — React frontend (TypeScript, Tailwind CSS v4)
- `src-tauri/` — Tauri Rust shell (minimal — sidecar bridge + plugins)
- `backend/` — Python backend sidecar (managed with `uv`, formatted with `ruff`)
- `install/` — Built .app and .dmg bundles

## Commands

- `npm run dev` — Vite dev server (port 1420)
- `npx tauri dev` — Full Tauri dev (Vite + Rust + sidecar)
- `npx tauri build --debug` — Debug build (.app + .dmg)
- `uv run ruff format backend/` — Format Python code
- `uv run ruff check backend/` — Lint Python code
- `npx tsc --noEmit` — TypeScript type check

## Architecture

- **Module system**: Each tool is self-contained in `src/modules/<tool>/` (frontend) and `backend/modules/<tool>/` (Python handlers)
- **Modules**: json-tool, port-monitor, latex-tool, speed-test, networking-stats, regex-tool, cron-manager — registered lazily in `src/lib/module-registry.ts`
- **IPC**: JSON-RPC over stdin/stdout between Tauri and Python sidecar (`backend/main.py` + `backend/rpc.py`)
- **Themes**: CSS custom properties on `<html data-theme="...">`, consumed by Tailwind semantic tokens
- **State**: Zustand stores per module, theme store persisted to localStorage

## Design Principles

- **Offline-first**: The app must run entirely locally and work with no internet connection. No external API calls, no CDN-loaded assets, no cloud dependencies at runtime. All data processing happens on-device.

## Performance Conventions

- **Zustand**: subscribe with per-field selectors (`useStore((s) => s.field)`), not whole-store destructuring — several modules render large trees (LaTeX palette) or poll at 500ms (networking stats). In callbacks, read current state via `useStore.getState()` so the callback identity stays stable.
- **Window/document listeners**: handlers must not depend on frequently-changing state, or the listener gets re-attached on every keystroke.
- **Hoist static work to module level**: static JSX (icons, gauge ticks), compiled regexes, lookup tables, and caches for expensive pure renders (e.g. KaTeX HTML in `SymbolPalette`).
- **Memoize derived data** (`useMemo`) when it feeds a render-heavy subtree or a polled component; pass primitives to memoized children where possible.
- **Python hot paths**: handlers polled by the frontend (networking snapshot every 500ms, speed-test progress) must not re-read files, re-import, or rebuild constants per call — cache at module level (`functools.lru_cache` for static file reads). Accumulate streamed output as a list of chunks, never string `+=`.

## Git Workflow

- **Always create a new branch before starting a new feature**: `git checkout -b feature/<short-description>` from an up-to-date `main`. Never implement new features directly on `main`.
- **Commit messages**: `<type>(<topic>): <description>` — e.g. `feat(cron-manager): ...`, `perf(app): ...`, `fix(latex): ...`

## Conventions

- Use `uv` for Python package management
- Use `ruff` for Python formatting/linting
- Use Homebrew for system-level package installs when possible
- Keep all packages project-local
