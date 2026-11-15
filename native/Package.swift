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
        .library(name: "MCVectorEditorKit", targets: ["MCVectorEditorKit"]),
    ],
    // Approved packages only (requirements DEP-001, DEP-002). The Neon plugin pins
    // Neon by revision, so SwiftPM only accepts the plugin itself by revision too
    // (this is its 0.8.1 tag).
    dependencies: [
        .package(url: "https://github.com/krzyzanowskim/STTextView", from: "2.4.1"),
        .package(url: "https://github.com/krzyzanowskim/STTextView-Plugin-TextFormation", from: "0.7.0"),
        .package(url: "https://github.com/krzyzanowskim/STTextView-Plugin-Annotations", from: "1.3.0"),
        .package(
            url: "https://github.com/krzyzanowskim/STTextView-Plugin-Neon",
            revision: "5a30db4ce7908a5414e7b499e2379bdc49991cd1"
        ),
    ],
    targets: [
        .target(
            name: "MCVectorEditorKit",
            path: "Sources/MCVectorEditorKit",
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
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
            dependencies: [
                "MCVectorCore",
                "MCVectorEditorKit",
                .product(name: "STTextView", package: "STTextView"),
                .product(name: "STTextView-Plugin-Neon", package: "STTextView-Plugin-Neon"),
                .product(name: "TextFormationPlugin", package: "STTextView-Plugin-TextFormation"),
                .product(name: "STTextViewAnnotationsPlugin", package: "STTextView-Plugin-Annotations"),
            ],
            path: "Sources/MCVector"
        ),
        .testTarget(
            name: "MCVectorEditorKitTests",
            dependencies: ["MCVectorEditorKit"],
            path: "Tests/MCVectorEditorKitTests",
            resources: [.copy("Fixtures")],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "MCVectorTests",
            dependencies: ["MCVectorCore"],
            path: "Tests/MCVectorTests"
        ),
    ]
)
