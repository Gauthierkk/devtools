.PHONY: dev app

# Launch frontend in browser at http://localhost:1420
dev:
	npx tauri dev

# Build the macOS .app and .dmg (debug mode)
app:
	npx tauri build --debug
