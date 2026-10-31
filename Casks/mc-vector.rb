cask 'mc-vector' do
  arch arm: 'aarch64', intel: 'x64'
  version "2.1.0"
  sha256 arm:   "9600e1c3ef8602121d3e6c3703d6e86ec6ddb6dc5d32c54b34268644517f0baa",
         intel: "52faa83ee152d029e09eb0e6c9d737fd04e813e3240d2405f39d6c8d2422b899"

  url "https://github.com/tukuyomil032/MC-Vector/releases/download/v#{version}/MC-Vector_#{version}_#{arch}.dmg"
  name 'MC-Vector'
  desc 'Minecraft server management desktop app'
  homepage 'https://github.com/tukuyomil032/MC-Vector'

  livecheck do
    url 'https://github.com/tukuyomil032/MC-Vector'
    strategy :github_latest
  end

  auto_updates true

  app 'MC-Vector.app'

  zap trash: [
    '~/Library/Application Support/com.tukuyomi032.mcvector',
    '~/Library/Caches/com.tukuyomi032.mcvector',
    '~/Library/Logs/MC-Vector',
    '~/Library/Preferences/com.tukuyomi032.mcvector.plist',
  ]

  caveats <<~EOS
    MC-Vector is ad-hoc signed and not notarized by Apple.
    If macOS Gatekeeper blocks the app on first launch:
      right-click MC-Vector.app → Open → Open anyway.
  EOS
end
