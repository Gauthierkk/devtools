#!/usr/bin/env bash
# Build the Python backend into a standalone sidecar binary for the Tauri bundle.
# Output: src-tauri/binaries/devtools-backend-<host-triple>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TRIPLE="$(rustc -Vv | awk '/^host:/ {print $2}')"
OUT_DIR="$ROOT/src-tauri/binaries"
WORK_DIR="$ROOT/backend/build"

uv run --directory "$ROOT" pyinstaller \
  --onefile \
  --name devtools-backend \
  --paths "$ROOT/backend" \
  --distpath "$WORK_DIR/dist" \
  --workpath "$WORK_DIR/work" \
  --specpath "$WORK_DIR" \
  --noconfirm \
  --log-level WARN \
  "$ROOT/backend/main.py"

mkdir -p "$OUT_DIR"
mv "$WORK_DIR/dist/devtools-backend" "$OUT_DIR/devtools-backend-$TRIPLE"
echo "Built $OUT_DIR/devtools-backend-$TRIPLE"
