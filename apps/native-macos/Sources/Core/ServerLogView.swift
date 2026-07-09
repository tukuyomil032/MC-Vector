import SwiftUI

/// Live console output for a running server, driven by `ServerLogViewModel`.
///
/// Structural sibling of the 3-3 spike's `LogStreamScrollView`
/// (`ServerProcessService.stdoutLines`-fed lines rendered via
/// `ScrollView` + `LazyVStack` + `ForEach`) -- the spike measured this
/// combination as clearly faster than `List` at high line-arrival rates
/// (9 hitches/517ms vs. 78/2017ms; see `spec/phase3a-spike-results.md`
/// §3-3), so this view keeps that shape rather than switching to `List`.
///
/// Auto-scrolls to the newest line as they arrive -- the spike view didn't
/// do this (it had no notion of "newest" worth chasing, being a synthetic
/// firehose), but it's expected behavior for any real log viewer. Scrolls
/// to a fixed sentinel row (`Self.bottomAnchorID`) rather than the last
/// `LogLine`'s own id: `LogLineBuffer`'s hysteresis trim removes a bulk
/// range from the *front* of `lines` once `retainedLineCount +
/// trimOvershoot` is exceeded, so "the last id" is still always present and
/// valid, but anchoring on a dedicated always-present sentinel avoids ever
/// depending on that being true.
struct ServerLogView: View {
    let viewModel: ServerLogViewModel
    let serverStatus: ServerStatus

    private static let bottomAnchorID = "server-log-bottom"

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 1) {
                    ForEach(self.viewModel.lines) { line in
                        Text(line.text)
                            .font(.system(.caption, design: .monospaced))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .textSelection(.enabled)
                    }
                    Color.clear
                        .frame(height: 1)
                        .id(Self.bottomAnchorID)
                }
                .padding(8)
            }
            .onChange(of: self.viewModel.lines.count) {
                proxy.scrollTo(Self.bottomAnchorID, anchor: .bottom)
            }
        }
        .task(id: self.serverStatus) {
            await self.viewModel.streamLogs()
        }
    }
}
