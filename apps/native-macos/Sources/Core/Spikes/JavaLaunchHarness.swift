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

        let stdoutData = try stdoutPipe.fileHandleForReading.readToEndCompat()
        let stderrData = try stderrPipe.fileHandleForReading.readToEndCompat()

        process.waitUntilExit()

        return JavaLaunchResult(
            terminationStatus: process.terminationStatus,
            standardOutput: String(bytes: stdoutData, encoding: .utf8) ?? "",
            standardError: String(bytes: stderrData, encoding: .utf8) ?? "",
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
