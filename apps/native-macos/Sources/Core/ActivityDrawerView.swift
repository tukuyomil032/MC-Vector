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

#Preview {
    ActivityDrawerView(entries: [
        ActivityEntry(serverId: "srv-1", serverName: "Survival", kind: .serverStatusChange(.offline)),
        ActivityEntry(serverId: "srv-2", serverName: "Creative", kind: .serverStatusChange(.crashed))
    ])
}

#Preview("Empty") {
    ActivityDrawerView(entries: [])
}
