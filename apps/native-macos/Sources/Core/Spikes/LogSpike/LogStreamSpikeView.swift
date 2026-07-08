import Foundation
import SwiftUI

public struct LogStreamListView: View {
    @State private var buffer: LogLineBuffer
    private let generator = DummyLogGenerator()
    private let linesPerSecond: Int

    public init(linesPerSecond: Int = 1000, retainedLineCount: Int = 5000, trimOvershoot: Int = 500) {
        self.linesPerSecond = linesPerSecond
        self._buffer = State(
            initialValue: LogLineBuffer(retainedLineCount: retainedLineCount, trimOvershoot: trimOvershoot),
        )
    }

    public var body: some View {
        List(self.buffer.lines) { line in
            Text(line.text)
                .font(.system(.caption, design: .monospaced))
        }
        .task {
            for await line in await self.generator.stream(linesPerSecond: self.linesPerSecond) {
                self.buffer.append(line)
            }
        }
    }
}

public struct LogStreamScrollView: View {
    @State private var buffer: LogLineBuffer
    private let generator = DummyLogGenerator()
    private let linesPerSecond: Int

    public init(linesPerSecond: Int = 1000, retainedLineCount: Int = 5000, trimOvershoot: Int = 500) {
        self.linesPerSecond = linesPerSecond
        self._buffer = State(
            initialValue: LogLineBuffer(retainedLineCount: retainedLineCount, trimOvershoot: trimOvershoot),
        )
    }

    public var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading) {
                ForEach(self.buffer.lines) { line in
                    Text(line.text)
                        .font(.system(.caption, design: .monospaced))
                }
            }
        }
        .task {
            for await line in await self.generator.stream(linesPerSecond: self.linesPerSecond) {
                self.buffer.append(line)
            }
        }
    }
}

public struct LogStreamSpikeApp: App {
    public enum Variant: String, Sendable {
        case list
        case scroll
    }

    private let variant: Variant

    public init() {
        let raw = ProcessInfo.processInfo.environment["MCV_LOG_SPIKE_VARIANT"] ?? Variant.list.rawValue
        self.variant = Variant(rawValue: raw) ?? .list
    }

    public var body: some Scene {
        WindowGroup("Log Stream Spike") {
            switch self.variant {
            case .list:
                LogStreamListView()
            case .scroll:
                LogStreamScrollView()
            }
        }
    }
}
