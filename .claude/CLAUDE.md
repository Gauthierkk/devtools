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
- `cd backend && uv run ruff format .` — Format Python code
- `cd backend && uv run ruff check .` — Lint Python code
- `npx tsc --noEmit` — TypeScript type check

## Architecture

- **Module system**: Each tool is self-contained in `src/modules/<tool>/` (frontend) and `backend/modules/<tool>/` (Python handlers)
- **IPC**: JSON-RPC over stdin/stdout between Tauri and Python sidecar
- **Themes**: CSS custom properties on `<html data-theme="...">`, consumed by Tailwind semantic tokens
- **State**: Zustand stores per module, theme store persisted to localStorage

## Design Principles

- **Offline-first**: The app must run entirely locally and work with no internet connection. No external API calls, no CDN-loaded assets, no cloud dependencies at runtime. All data processing happens on-device.

## Git Workflow

- **Always create a new branch before starting a new feature**: `git checkout -b feature/<short-description>` from an up-to-date `main`. Never implement new features directly on `main`.

## Conventions

- Use `uv` for Python package management
- Use `ruff` for Python formatting/linting
- Use Homebrew for system-level package installs when possible
- Keep all packages project-local
