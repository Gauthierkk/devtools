.PHONY: dev app release

# Launch frontend in browser at http://localhost:1420
dev:
	@npm install --silent
	@command -v uv >/dev/null 2>&1 || (echo "❌ uv not found" && exit 1)
	@uv sync --group dev || (echo "Failed to sync Python dependencies" && exit 1)
	npx tauri dev

# Build the macOS .app and .dmg (debug mode)
app:
	npx tauri build --debug

# Build release and create a GitHub release (tag first: git tag v0.1.0 && git push --tags)
release:
	npx tauri build
	@echo "✅ Release build complete. DMG at src-tauri/target/release/bundle/dmg/"
