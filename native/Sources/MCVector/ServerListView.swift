// SPDX-License-Identifier: GPL-3.0-or-later

import MCVectorCore
import SwiftUI

/// Sidebar list of registered servers (UI-001, first slice: read-only).
struct ServerListView: View {
    @State private var state: LoadState = .loading
    @State private var selection: String?

    enum LoadState {
        case loading
        case loaded([ServerProfile])
        case failed(CoreError)
    }

    var body: some View {
        NavigationSplitView {
            sidebar
                .navigationSplitViewColumnWidth(min: 220, ideal: 260)
                .toolbar {
                    ToolbarItem {
                        Button {
                            Task { await load() }
                        } label: {
                            Label("servers.reload", systemImage: "arrow.clockwise")
                        }
                    }
                }
        } detail: {
            detail
        }
        .task { await load() }
    }

    @ViewBuilder
    private var sidebar: some View {
        switch state {
        case .loading:
            ProgressView("servers.loading")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case let .failed(error):
            ContentUnavailableView {
                Label("servers.load_failed", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error.localizedText())
            } actions: {
                if error.retryable {
                    Button("servers.retry") { Task { await load() } }
                }
            }
        case let .loaded(servers) where servers.isEmpty:
            ContentUnavailableView(
                "servers.empty_title",
                systemImage: "server.rack",
                description: Text("servers.empty_description")
            )
        case let .loaded(servers):
            List(servers, id: \.id, selection: $selection) { server in
                ServerRow(server: server)
            }
        }
    }

    @ViewBuilder
    private var detail: some View {
        if case let .loaded(servers) = state,
           let server = servers.first(where: { $0.id == selection }) {
            ServerSummaryView(server: server)
        } else {
            ContentUnavailableView("servers.select_prompt", systemImage: "sidebar.left")
        }
    }

    private func load() async {
        do {
            state = .loaded(try await CoreClient.servers())
        } catch {
            state = .failed(error)
        }
    }
}

private struct ServerRow: View {
    let server: ServerProfile

    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(server.status == "online" ? Color.green : Color.secondary.opacity(0.4))
                .frame(width: 8, height: 8)
                .accessibilityLabel(Text(server.status == "online" ? "status.online" : "status.offline"))
            VStack(alignment: .leading, spacing: 2) {
                Text(server.name)
                    .lineLimit(1)
                Text("\(server.software) \(server.version)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            if server.unavailableReason != nil {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.yellow)
                    .help(Text("servers.unavailable"))
            }
        }
        .padding(.vertical, 2)
    }
}

private struct ServerSummaryView: View {
    let server: ServerProfile

    var body: some View {
        Form {
            Section {
                LabeledContent("server.software", value: "\(server.software) \(server.version)")
                if let port = server.port {
                    LabeledContent("server.port", value: String(port))
                }
                if let memoryMb = server.memoryMb {
                    LabeledContent("server.memory", value: Self.formatMemory(megabytes: memoryMb))
                }
                if let group = server.groupName, !group.isEmpty {
                    LabeledContent("server.group", value: group)
                }
                if let reason = server.unavailableReason {
                    LabeledContent("servers.unavailable", value: reason)
                }
            } header: {
                Text(server.name).font(.title2.bold())
            }
        }
        .formStyle(.grouped)
    }

    /// The registry stores megabytes; show whole gigabytes when it divides evenly.
    static func formatMemory(megabytes: UInt64) -> String {
        if megabytes >= 1024, megabytes % 1024 == 0 {
            return "\(megabytes / 1024) GB"
        }
        return "\(megabytes) MB"
    }
}
