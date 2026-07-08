// swift-tools-version:6.2
import PackageDescription

let package = Package(
    name: "Native",
    platforms: [.macOS(.v26)],
    products: [
        .library(name: "Core", targets: ["Core"])
    ],
    dependencies: [
        .package(url: "https://github.com/nicklockwood/SwiftFormat", from: "0.62.1"),
        .package(url: "https://github.com/realm/SwiftLint", from: "0.65.0"),
    ],
    targets: [
        .executableTarget(
            name: "App",
            dependencies: ["Core"],
            plugins: [
                .plugin(name: "SwiftLintBuildToolPlugin", package: "SwiftLint")
            ]
        ),
        .target(
            name: "Core",
            plugins: [
                .plugin(name: "SwiftLintBuildToolPlugin", package: "SwiftLint")
            ]
        ),
        .testTarget(
            name: "CoreTests",
            dependencies: ["Core"],
            plugins: [
                .plugin(name: "SwiftLintBuildToolPlugin", package: "SwiftLint")
            ]
        ),
    ]
)
