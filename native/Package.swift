// swift-tools-version: 6.0
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Build with native/build.sh, not `swift build` directly: the script builds the
// Rust core first and passes `-Xlinker -L native/.build/rust/lib` so the
// MCVectorFFI module can link libmcvector_ffi.a. All output stays in
// native/.build (REPO-002).

import PackageDescription

let package = Package(
    name: "MCVector",
    defaultLocalization: "en",
    platforms: [.macOS(.v15)],
    products: [
        .executable(name: "MCVector", targets: ["MCVector"]),
    ],
    targets: [
        // UniFFI-generated C header + hand-written module map for the Rust static library.
        .systemLibrary(
            name: "MCVectorFFI",
            path: "Sources/MCVectorFFI"
        ),
        // Typed Swift API over the Rust core. Generated/ holds the UniFFI Swift bindings.
        .target(
            name: "MCVectorCore",
            dependencies: ["MCVectorFFI"],
            path: "Sources/MCVectorCore",
            linkerSettings: [
                // System frameworks the Rust static library links against.
                .linkedFramework("CoreFoundation"),
                .linkedFramework("Security"),
                .linkedFramework("SystemConfiguration"),
                .linkedLibrary("iconv"),
            ]
        ),
        // Localized strings come from native/Resources/Localizable.xcstrings. build.sh compiles
        // it into the .app's Contents/Resources (en.lproj, ja.lproj), so the app uses Bundle.main.
        .executableTarget(
            name: "MCVector",
            dependencies: ["MCVectorCore"],
            path: "Sources/MCVector"
        ),
        .testTarget(
            name: "MCVectorTests",
            dependencies: ["MCVectorCore"],
            path: "Tests/MCVectorTests"
        ),
    ]
)
