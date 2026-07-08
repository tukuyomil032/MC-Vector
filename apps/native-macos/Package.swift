// swift-tools-version:6.2
import PackageDescription

let package = Package(
    name: "Native",
    platforms: [.macOS(.v26)],
    products: [
        .library(name: "Core", targets: ["Core"])
    ],
    dependencies: [
        .package(url: "https://github.com/nicklockwood/SwiftFormat", from: "0.62.1")
    ],
    targets: [
        .executableTarget(
            name: "App",
            dependencies: ["Core"]
        ),
        .target(
            name: "Core"
        ),
        .testTarget(
            name: "CoreTests",
            dependencies: ["Core"]
        ),
    ]
)
