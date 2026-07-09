import Foundation
import Testing
@testable import Core

private func makeLine(_ id: Int) -> LogLine {
    LogLine(id: id, timestamp: ContinuousClock().now, text: "line #\(id)")
}

@Test("append retains all lines while under the overshoot threshold")
func logLineBufferRetainsUnderThreshold() {
    var buffer = LogLineBuffer(retainedLineCount: 5, trimOvershoot: 2)
    for id in 1 ... 7 {
        buffer.append(makeLine(id))
    }

    #expect(buffer.lines.count == 7)
}

@Test("append trims back down to retainedLineCount once overshoot is exceeded")
func logLineBufferTrimsAfterOvershoot() {
    var buffer = LogLineBuffer(retainedLineCount: 5, trimOvershoot: 2)
    for id in 1 ... 8 {
        buffer.append(makeLine(id))
    }

    #expect(buffer.lines.count == 5)
    #expect(buffer.lines.map(\.id) == [4, 5, 6, 7, 8])
}
