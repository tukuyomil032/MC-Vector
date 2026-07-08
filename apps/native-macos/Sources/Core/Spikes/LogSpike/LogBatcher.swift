import Foundation

public struct LogBatcher: Sendable {
    private let interval: Duration

    public init(interval: Duration) {
        self.interval = interval
    }

    /// Groups `lines` into batches such that every line whose timestamp falls
    /// within the same `interval`-sized window (measured from the first
    /// line's timestamp) lands in the same batch, in arrival order.
    public func batch(_ lines: [LogLine]) -> [[LogLine]] {
        guard let first = lines.first else { return [] }

        var batches: [[LogLine]] = []
        var currentBatch: [LogLine] = []
        var windowStart = first.timestamp

        for line in lines {
            if line.timestamp - windowStart >= self.interval, !currentBatch.isEmpty {
                batches.append(currentBatch)
                currentBatch = []
                windowStart = line.timestamp
            }
            currentBatch.append(line)
        }

        if !currentBatch.isEmpty {
            batches.append(currentBatch)
        }

        return batches
    }
}
