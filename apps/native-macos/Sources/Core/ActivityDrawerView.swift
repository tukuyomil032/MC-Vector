import SwiftUI

/// Content of the Activity Drawer -- a global (all-servers) view of
/// `ServerListViewModel.activityLog`, presented via `.inspector` from
/// `RootView`.
///
/// Deliberately a plain `List`/`ForEach`, not the `ScrollView` + `LazyVStack`
/// pattern task 3-8's console output needed: that pattern exists for a
/// high-frequency, potentially-thousands-of-lines stream where `List`'s
/// diffing overhead matters. `activityLog` is bounded (see
/// `ServerListViewModel.activityLogCap`) and updates far less often (one
/// entry per process start/stop/crash, not per log line), so `List`'s
/// automatic diffing is the right, standard, simple tool here -- and it
/// (like `.inspector` and `.toolbar`) gets Liquid Glass styling automatically
/// just by being used, with no manual `.glassEffect` needed.
struct ActivityDrawerView: View {
    let entries: [ActivityEntry]

    var body: some View {
        Group {
            if self.entries.isEmpty {
                ContentUnavailableView(
                    "No Activity Yet",
                    systemImage: "clock.arrow.circlepath",
                    description: Text("Server start, stop, and crash events will appear here."),
                )
            } else {
                List(self.entries) { entry in
                    ActivityRow(entry: entry)
                }
            }
        }
        .navigationTitle("Activity")
    }
}

private struct ActivityRow: View {
    let entry: ActivityEntry

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: self.systemImage)
                .foregroundStyle(self.tint)
                .frame(width: 20)

            VStack(alignment: .leading, spacing: 2) {
                Text(self.entry.serverName)
                    .font(.body)
                Text(self.statusLabel)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            // Standard SwiftUI relative-date `Text` -- auto-updates ("2m
            // ago" -> "3m ago") without any manual timer/formatter code.
            Text(self.entry.timestamp, style: .relative)
                .font(.caption)
                .foregroundStyle(.secondary)
                .monospacedDigit()
        }
        .accessibilityElement(children: .combine)
    }

    private var status: ServerStatus {
        switch self.entry.kind {
        case let .serverStatusChange(status): status
        }
    }

    private var statusLabel: String {
        self.status.rawValue.capitalized
    }

    private var systemImage: String {
        switch self.status {
        case .online: "play.circle.fill"
        case .offline: "stop.circle"
        case .starting, .restarting: "arrow.triangle.2.circlepath.circle"
        case .stopping: "stop.circle.fill"
        case .crashed: "exclamationmark.triangle.fill"
        }
    }

    private var tint: Color {
        switch self.status {
        case .online: .green
        case .offline: .secondary
        case .starting, .restarting, .stopping: .orange
        case .crashed: .red
        }
    }
}

#Preview {
    ActivityDrawerView(entries: [
        ActivityEntry(serverId: "srv-1", serverName: "Survival", kind: .serverStatusChange(.offline)),
        ActivityEntry(serverId: "srv-2", serverName: "Creative", kind: .serverStatusChange(.crashed))
    ])
}

#Preview("Empty") {
    ActivityDrawerView(entries: [])
}
