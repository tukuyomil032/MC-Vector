// SPDX-License-Identifier: GPL-3.0-or-later

import MCVectorCore
import SwiftUI

/// Chooses where entries move to by browsing folders instead of typing a
/// path: the path as buttons from the server folder down, then the folders
/// inside the one being browsed.
struct MoveDestinationSheet: View {
    let serverID: String
    let serverName: String
    let request: MoveRequest
    let move: ([String]) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var browsed: [String]
    @State private var folders: [String] = []
    @State private var isLoading = false
    @State private var loadError: CoreError?

    init(serverID: String, serverName: String, request: MoveRequest, move: @escaping ([String]) -> Void) {
        self.serverID = serverID
        self.serverName = serverName
        self.request = request
        self.move = move
        _browsed = State(initialValue: request.start)
    }

    private var browsedPath: String { browsed.joined(separator: "/") }

    /// Entries cannot go into themselves or anything inside them.
    private func isInsideMoved(_ path: String) -> Bool {
        request.entries.contains { path == $0 || path.hasPrefix($0 + "/") }
    }

    /// Moving into the folder the entries are already in does nothing.
    private var isCurrentLocation: Bool {
        request.entries.allSatisfy { entry in
            let parent = entry.split(separator: "/").dropLast().joined(separator: "/")
            return parent == browsedPath
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L10n.t("native.files.moveTitle", ["subject": subject]))
                .font(.headline)
            pathBar
            list
            if let loadError {
                Text(loadError.uiText)
                    .font(.callout)
                    .foregroundStyle(.red)
            }
            HStack {
                if isCurrentLocation {
                    Text(L10n.t("native.files.currentLocation"))
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button(L10n.t("common.cancel")) { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Button(L10n.t("native.files.moveHere")) {
                    move(browsed)
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
                .disabled(isCurrentLocation || isInsideMoved(browsedPath))
            }
        }
        .padding(20)
        .frame(width: 460, height: 420)
        .task(id: browsed) { await load() }
    }

    private var subject: String {
        request.entries.count == 1
            ? L10n.t(
                "native.files.quoted", ["name": request.entries[0].split(separator: "/").last.map(String.init) ?? ""])
            : L10n.t("native.files.itemCount", ["count": request.entries.count])
    }

    private var pathBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 2) {
                crumb(serverName, depth: 0, symbol: "server.rack")
                ForEach(Array(browsed.enumerated()), id: \.offset) { index, name in
                    Image(systemName: "chevron.right")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                    crumb(name, depth: index + 1, symbol: nil)
                }
            }
        }
    }

    private func crumb(_ title: String, depth: Int, symbol: String?) -> some View {
        Button {
            browsed = Array(browsed.prefix(depth))
        } label: {
            if let symbol { Label(title, systemImage: symbol) } else { Text(title) }
        }
        .buttonStyle(.borderless)
        .fontWeight(depth == browsed.count ? .semibold : .regular)
        .foregroundStyle(depth == browsed.count ? .primary : .secondary)
        .lineLimit(1)
    }

    private var list: some View {
        List {
            if !browsed.isEmpty {
                Button {
                    browsed.removeLast()
                } label: {
                    Label(L10n.t("files.toolbar.goUp"), systemImage: "arrow.turn.left.up")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
            ForEach(folders, id: \.self) { name in
                let path = (browsed + [name]).joined(separator: "/")
                let blocked = isInsideMoved(path)
                Button {
                    browsed.append(name)
                } label: {
                    HStack {
                        Label(name, systemImage: "folder.fill")
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(blocked)
                .opacity(blocked ? 0.4 : 1)
            }
        }
        .listStyle(.bordered)
        .alternatingRowBackgrounds()
        .overlay {
            if isLoading && folders.isEmpty {
                ProgressView()
            } else if !isLoading && folders.isEmpty && loadError == nil {
                Text(L10n.t("native.files.noFolders"))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do throws(CoreError) {
            let items = try await CoreClient.listFiles(serverID: serverID, relative: browsedPath)
            folders = items.filter(\.isDirectory).map(\.name).sorted {
                $0.localizedStandardCompare($1) == .orderedAscending
            }
            loadError = nil
        } catch {
            folders = []
            loadError = error
        }
    }
}
