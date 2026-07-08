import Foundation

public struct JavaLaunchResult: Sendable, Equatable {
    public let terminationStatus: Int32
    public let standardOutput: String
    public let standardError: String

    public init(terminationStatus: Int32, standardOutput: String, standardError: String) {
        self.terminationStatus = terminationStatus
        self.standardOutput = standardOutput
        self.standardError = standardError
    }
}

public enum JavaLaunchError: Error, Sendable {
    case executableNotFound(URL)
}

public actor JavaLaunchHarness {
    public init() {}

    public func launch(executableURL: URL, arguments: [String]) async throws -> JavaLaunchResult {
        guard FileManager.default.isExecutableFile(atPath: executableURL.path) else {
            throw JavaLaunchError.executableNotFound(executableURL)
        }

        let process = Process()
        process.executableURL = executableURL
        process.arguments = arguments

        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        try process.run()

        // Read both pipes concurrently: draining stdout fully before starting
        // on stderr (or vice versa) deadlocks once a child fills the OS pipe
        // buffer on the pipe being read second while the other is still full.
        async let stdoutData = stdoutPipe.fileHandleForReading.readToEndCompat()
        async let stderrData = stderrPipe.fileHandleForReading.readToEndCompat()
        let (stdoutBytes, stderrBytes) = try await (stdoutData, stderrData)

        process.waitUntilExit()

        return JavaLaunchResult(
            terminationStatus: process.terminationStatus,
            standardOutput: String(bytes: stdoutBytes, encoding: .utf8) ?? "",
            standardError: String(bytes: stderrBytes, encoding: .utf8) ?? "",
        )
    }
}

private extension FileHandle {
    func readToEndCompat() throws -> Data {
        if let data = try self.readToEnd() {
            return data
        }
        return Data()
    }
}
