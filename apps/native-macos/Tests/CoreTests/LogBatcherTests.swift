import Foundation
import Testing
@testable import Core

@Test("batch groups lines within the same interval window together")
func logBatcherGroupsWithinWindow() {
    let clock = ContinuousClock()
    let start = clock.now
    let lines = [
        LogLine(id: 1, timestamp: start, text: "a"),
        LogLine(id: 2, timestamp: start + .milliseconds(10), text: "b"),
        LogLine(id: 3, timestamp: start + .milliseconds(20), text: "c")
    ]

    let batcher = LogBatcher(interval: .milliseconds(100))
    let batches = batcher.batch(lines)

    #expect(batches.count == 1)
    #expect(batches.first?.count == 3)
}

@Test("batch splits lines that cross the interval boundary")
func logBatcherSplitsAcrossWindows() {
    let clock = ContinuousClock()
    let start = clock.now
    let lines = [
        LogLine(id: 1, timestamp: start, text: "a"),
        LogLine(id: 2, timestamp: start + .milliseconds(50), text: "b"),
        LogLine(id: 3, timestamp: start + .milliseconds(150), text: "c"),
        LogLine(id: 4, timestamp: start + .milliseconds(160), text: "d")
    ]

    let batcher = LogBatcher(interval: .milliseconds(100))
    let batches = batcher.batch(lines)

    #expect(batches.count == 2)
    #expect(batches[0].map(\.id) == [1, 2])
    #expect(batches[1].map(\.id) == [3, 4])
}

@Test("batch returns an empty array for empty input")
func logBatcherHandlesEmptyInput() {
    let batcher = LogBatcher(interval: .milliseconds(100))
    #expect(batcher.batch([]).isEmpty)
}

@Test("batch returns a single batch for a single line")
func logBatcherHandlesSingleLine() {
    let line = LogLine(id: 1, timestamp: ContinuousClock().now, text: "a")
    let batcher = LogBatcher(interval: .milliseconds(100))
    let batches = batcher.batch([line])

    #expect(batches.count == 1)
    #expect(batches.first?.map(\.id) == [1])
}

@Test("batch groups lines sharing an identical timestamp")
func logBatcherGroupsIdenticalTimestamps() {
    let timestamp = ContinuousClock().now
    let lines = [
        LogLine(id: 1, timestamp: timestamp, text: "a"),
        LogLine(id: 2, timestamp: timestamp, text: "b"),
        LogLine(id: 3, timestamp: timestamp, text: "c")
    ]

    let batcher = LogBatcher(interval: .milliseconds(100))
    let batches = batcher.batch(lines)

    #expect(batches.count == 1)
    #expect(batches.first?.map(\.id) == [1, 2, 3])
}
