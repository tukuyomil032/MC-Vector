import SwiftUI

/// Content hosted inside `FloatingConsolePanel`: a small header bar
/// identifying the server, above the shared `ServerLogView`.
///
/// **Liquid Glass usage**: per `spec/native-macos-requirements.md` §5.4's
/// policy -- "機能レイヤー(toolbar/ナビ/コントロール)限定、コンテンツ本体には使わない"
/// (glass is for the functional/toolbar layer only, never the content body)
/// -- `.glassEffect` is applied *only* to `header` below, not to the log
/// content area. This is a deliberate departure from the Phase 3-A spike's
/// `GlassSpikeContent`, which applied `.glassEffect` to its entire content
/// view for demo simplicity; that shape was never the intended production
/// policy. The panel's own window background is left at the AppKit default
/// (opaque), matching the same policy.
///
/// This also means the known `.nonactivatingPanel` + `.glassEffect`
/// degrade-to-blur-when-inactive bug (`spec/native-macos-requirements.md`
/// §5.4, `spec/phase3a-spike-results.md` §3-1) has minimal surface here: it
/// can only visibly affect this one small header bar, never the log
/// content most of the panel's area is spent on.
struct FloatingConsoleContentView: View {
    let serverName: String
    let viewModel: ServerLogViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            self.header
            Divider()
            ServerLogView(viewModel: self.viewModel)
        }
        .frame(minWidth: 420, minHeight: 240)
    }

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "terminal")
                .foregroundStyle(.secondary)
            Text(self.serverName)
                .font(.headline)
            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .glassEffect(.regular, in: .rect(cornerRadius: 10))
        .padding(8)
    }
}

#Preview {
    FloatingConsoleContentView(
        serverName: "Survival",
        viewModel: ServerLogViewModel(serverId: "srv-1", processService: ServerProcessService()),
    )
}
