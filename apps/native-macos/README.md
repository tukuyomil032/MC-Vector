# MC-Vector Native (macOS)

Independent Swift/SwiftUI reimplementation of MC-Vector for macOS Tahoe (26)+.
See `spec/native-macos-requirements.md` for why this isn't a shared-core port,
and `spec/phase-tasks.md` for the phase-by-phase task breakdown.

No `.xcodeproj` — this is a plain SwiftPM package. `App` is a thin
`@main` entry point; `Core` holds the actual views/logic (this split is what
lets `#Preview` work without `ENABLE_DEBUG_DYLIB`, which can only be set via
an `.xcodeproj`).

## Requirements

- macOS 26 (Tahoe)+
- Xcode 26+ / Swift 6.2+

## Commands

Run from `apps/native-macos/`:

```bash
swift build   # build App + Core
swift test    # run CoreTests (Swift Testing)
```

Format and lint are exposed as SwiftPM plugins:

```bash
# SwiftFormat (command plugin — no build-tool plugin exists upstream)
swift package --allow-writing-to-package-directory swiftformat        # write
swift package --allow-writing-to-package-directory swiftformat --lint # check only

# SwiftLint (build-tool plugin — runs automatically as part of `swift build`/`swift test`)
swift package --allow-writing-to-package-directory swiftlint --fix    # autocorrect
```

`lefthook` runs both automatically on commit for files under `apps/native-macos/**/*.swift`
(see the `lint-format-swift` job in the root `lefthook.yml`); it no-ops with a message if
`swift` isn't on `PATH` locally, since CI (`.github/workflows/native.yml`) is the enforcement
backstop either way.

## Opening in Xcode

Xcode 26 can open `Package.swift` directly — no separate project file needed.
