import Foundation

public struct LogLine: Sendable, Identifiable, Equatable {
    public let id: Int
    public let timestamp: ContinuousClock.Instant
    public let text: String

    public init(id: Int, timestamp: ContinuousClock.Instant, text: String) {
        self.id = id
        self.timestamp = timestamp
        self.text = text
    }
}

public actor DummyLogGenerator {
    public init() {}

    public func stream(linesPerSecond: Int) -> AsyncStream<LogLine> {
        let interval = Duration.seconds(1) / Double(max(linesPerSecond, 1))

        return AsyncStream { continuation in
            let task = Task {
                var index = 0
                let clock = ContinuousClock()
                while !Task.isCancelled {
                    index += 1
                    continuation.yield(
                        LogLine(id: index, timestamp: clock.now, text: "[spike] log line #\(index)"),
                    )
                    try? await Task.sleep(for: interval)
                }
                continuation.finish()
            }

            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }
}
