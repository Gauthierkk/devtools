cask "devtools" do
  version "0.1.0"
  sha256 "PLACEHOLDER" # Update after first release

  url "https://github.com/Gauthierkk/devtools/releases/download/v#{version}/DevTools_#{version}_aarch64.dmg"
  name "DevTools"
  desc "Modular macOS-first developer toolkit"
  homepage "https://github.com/Gauthierkk/devtools"

  depends_on macos: ">= :ventura"
  depends_on arch: :arm64

  app "DevTools.app"

  zap trash: [
    "~/Library/Application Support/com.devtools.studio",
    "~/Library/Caches/com.devtools.studio",
  ]
end
