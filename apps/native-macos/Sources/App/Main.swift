import Core
import Foundation

@main
struct Main {
    static func main() async {
        guard let spike = ProcessInfo.processInfo.environment["MCV_SPIKE"] else {
            print("MC-Vector Native starting…")
            return
        }

        switch spike {
        case "hardened-runtime-java":
            await self.runHardenedRuntimeJavaSpike()
        case "panel-nspanel":
            PanelSpikeRunner.runNSPanelBridge()
        case "panel-window":
            PanelSpikeRunner.runSwiftUIWindowLevel()
        case "log-stream":
            PanelSpikeRunner.runLogStreamSpike()
        default:
            print("Unknown MCV_SPIKE value: \(spike)")
        }
    }

    static func runHardenedRuntimeJavaSpike() async {
        let javaCandidates = [
            "/opt/homebrew/opt/openjdk/bin/java",
            "/usr/bin/java"
        ]
        guard let javaPath = javaCandidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else {
            print("java executable not found in known locations")
            return
        }

        let harness = JavaLaunchHarness()
        do {
            let result = try await harness.launch(
                executableURL: URL(fileURLWithPath: javaPath),
                arguments: ["-version"],
            )
            print("exitCode=\(result.terminationStatus)")
            print("stdout=\(result.standardOutput)")
            print("stderr=\(result.standardError)")
        } catch {
            print("launch failed: \(error)")
        }
    }
}
