import Foundation
import Testing
@testable import Core

@Test("launch succeeds and captures stdout for a trivial executable")
func javaLaunchHarnessCapturesStdout() async throws {
    let harness = JavaLaunchHarness()
    let result = try await harness.launch(
        executableURL: URL(fileURLWithPath: "/bin/echo"),
        arguments: ["hardened-runtime-spike"],
    )

    #expect(result.terminationStatus == 0)
    #expect(result.standardOutput.trimmingCharacters(in: .whitespacesAndNewlines) == "hardened-runtime-spike")
    #expect(result.standardError.isEmpty)
}

@Test("launch surfaces non-zero exit codes")
func javaLaunchHarnessSurfacesNonZeroExit() async throws {
    let harness = JavaLaunchHarness()
    let result = try await harness.launch(
        executableURL: URL(fileURLWithPath: "/usr/bin/false"),
        arguments: [],
    )

    #expect(result.terminationStatus != 0)
}

@Test("launch throws for a non-existent executable")
func javaLaunchHarnessThrowsForMissingExecutable() async throws {
    let harness = JavaLaunchHarness()
    let missingURL = URL(fileURLWithPath: "/nonexistent/path/to/java")

    await #expect(throws: JavaLaunchError.self) {
        _ = try await harness.launch(executableURL: missingURL, arguments: [])
    }
}
