import SwiftUI

/// A single row in `ActivityDrawerView`'s `List`, rendering one
/// `ActivityEntry`.
///
/// Split into its own file (task 3-12 code-review fix) -- previously
/// declared alongside `ActivityDrawerView` in `ActivityDrawerView.swift`,
/// violating this codebase's one-type-per-file convention that every other
/// View in this phase already follows. Left at the default `internal`
/// visibility (not `private`, since `private` would no longer be usable from
/// `ActivityDrawerView.swift` once split out; not `public`, since nothing
/// outside this module constructs a row directly -- `ActivityDrawerView` is
/// the sole caller) -- an implementation detail of the drawer, not part of
/// this package's public API.
struct ActivityRow: View {
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
    List {
        ActivityRow(
            entry: ActivityEntry(serverId: "srv-1", serverName: "Survival", kind: .serverStatusChange(.online)),
        )
        ActivityRow(
            entry: ActivityEntry(serverId: "srv-2", serverName: "Creative", kind: .serverStatusChange(.crashed)),
        )
    }
}
