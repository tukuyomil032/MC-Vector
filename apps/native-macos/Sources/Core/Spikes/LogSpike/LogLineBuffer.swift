/// A fixed-capacity buffer that trims with hysteresis: it only shifts the
/// backing array once the overshoot allowance is exceeded, rather than on
/// every single append. Trimming to exactly `retainedLineCount` on every
/// append would make `Array.removeFirst(_:)` the dominant cost at
/// high ingest rates, masking the rendering cost this spike exists to measure.
public struct LogLineBuffer {
    public private(set) var lines: [LogLine] = []
    private let retainedLineCount: Int
    private let trimOvershoot: Int

    public init(retainedLineCount: Int, trimOvershoot: Int) {
        self.retainedLineCount = retainedLineCount
        self.trimOvershoot = trimOvershoot
    }

    public mutating func append(_ line: LogLine) {
        self.lines.append(line)
        if self.lines.count > self.retainedLineCount + self.trimOvershoot {
            self.lines.removeFirst(self.lines.count - self.retainedLineCount)
        }
    }
}
