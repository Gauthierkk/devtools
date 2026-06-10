# DevTools

A modular macOS-first desktop app built with Tauri, React/TypeScript, and a Python sidecar backend.

## Install

```sh
brew tap gauthierkk/tap
brew install --cask devtools
```

## Development

```sh
make dev       # Vite + Tauri + Python sidecar (hot reload)
make app       # Build debug .app/.dmg locally
make release   # Build release .dmg
```

### Prerequisites

- Node.js 22+
- Rust (via rustup)
- [uv](https://docs.astral.sh/uv/) (Python package manager)

## License

MIT — see [LICENSE](./LICENSE).
