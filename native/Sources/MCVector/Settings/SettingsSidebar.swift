// SPDX-License-Identifier: GPL-3.0-or-later

import MCVectorCore
import SwiftUI

/// The Settings window's sidebar (Snapzy's layout): a search field, the
/// server card, the three section tiles and the section's pages. While
/// searching, the results replace everything under the field.
struct SettingsSidebar: View {
    @Binding var page: SettingsPage
    @Binding var query: String
    let servers: [ServerProfile]
    let serverID: String?
    let status: (String) -> String
    let properties: PropertiesModel?
    let selectServer: (String) -> Void
    let reveal: (SettingsSearchEntry) -> Void

    /// The result opened last, so ↑↓ continue from it.
    @State private var activeResultID: String?
    @FocusState private var isSearchFocused: Bool

    private var isSearching: Bool { !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var server: ServerProfile? { servers.first { $0.id == serverID } }

    private var groups: [SettingsSearchGroup] {
        SettingsSearch.search(query, properties: properties, hasServer: server != nil)
    }

    var body: some View {
        VStack(spacing: 0) {
            searchField
                .padding(.horizontal, 12)
                .padding(.top, 4)
                .padding(.bottom, 10)
            ScrollView(.vertical) {
                Group {
                    if isSearching {
                        results
                    } else {
                        browse
                    }
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
                .animation(Motion.standard, value: page.section)
            }
            .scrollIndicators(.never)
            .focusable()
            .focusEffectDisabled()
            .onMoveCommand(perform: move)
        }
        .background {
            // ⌘F jumps to the search field, like Finder and System Settings.
            Button("") { isSearchFocused = true }
                .keyboardShortcut("f", modifiers: .command)
                .hidden()
        }
        .onChange(of: query) { activeResultID = nil }
    }

    // MARK: Search

    private var searchField: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.secondary)
            TextField(L10n.t("native.settings.search"), text: $query)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .focused($isSearchFocused)
                .onSubmit {
                    let flat = flatResults
                    if let entry = flat.first(where: { $0.id == activeResultID }) ?? flat.first { open(entry) }
                }
                .onMoveCommand(perform: move)
                .onExitCommand { query = "" }
            if isSearching {
                Button {
                    query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 12))
                        .foregroundStyle(.tertiary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.t("native.settings.clearSearch"))
            }
        }
        .padding(.horizontal, 10)
        .frame(height: 30)
        .background(Capsule().fill(Color.primary.opacity(0.06)))
        .overlay(Capsule().strokeBorder(Color.primary.opacity(isSearchFocused ? 0.14 : 0.04), lineWidth: 1))
    }

    /// Results in display order: each page, then its rows.
    private var flatResults: [SettingsSearchEntry] {
        groups.flatMap { group in
            [SettingsSearchEntry(page: group.page, title: group.page.title, section: nil, detail: nil)]
                + group.entries
        }
    }

    @ViewBuilder
    private var results: some View {
        let groups = groups
        if groups.isEmpty {
            Text(L10n.t("native.settings.noResults"))
                .font(.callout)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
                .padding(.top, 24)
        } else {
            VStack(spacing: 12) {
                ForEach(groups) { group in
                    VStack(spacing: 4) {
                        SettingsSidebarRow(
                            title: group.page.title, symbol: group.page.symbol, tint: group.page.tint,
                            isSelected: page == group.page && (activeResultID == nil || activeResultID == group.id)
                        ) {
                            open(
                                SettingsSearchEntry(
                                    page: group.page, title: group.page.title, section: nil, detail: nil))
                        }
                        ForEach(group.entries) { entry in
                            SettingsSearchResultRow(entry: entry, query: query, isSelected: activeResultID == entry.id)
                            {
                                open(entry)
                            }
                        }
                    }
                }
            }
        }
    }

    private func open(_ entry: SettingsSearchEntry) {
        activeResultID = entry.section == nil ? entry.page.id : entry.id
        reveal(entry)
    }

    // MARK: Browse

    private var browse: some View {
        VStack(alignment: .leading, spacing: 12) {
            SettingsServerCard(servers: servers, server: server, status: status, select: selectServer)
            HStack(spacing: 8) {
                ForEach(SettingsSection.allCases, id: \.self) { section in
                    SettingsBigTile(
                        title: L10n.t(section.titleKey), symbol: section.symbol, tint: section.tint,
                        isSelected: page.section == section
                    ) {
                        withAnimation(Motion.standard) { page = section.firstPage }
                    }
                }
            }
            VStack(spacing: 16) {
                ForEach(pageGroups, id: \.self) { group in
                    VStack(spacing: 4) {
                        ForEach(group, id: \.self) { candidate in
                            SettingsSidebarRow(
                                title: candidate.title, symbol: candidate.symbol, tint: candidate.tint,
                                isSelected: page == candidate
                            ) {
                                page = candidate
                            }
                        }
                    }
                }
            }
            .id(page.section)
            .transition(.motionFade)
        }
    }

    /// The section's page groups, without Properties pages that have nothing to show.
    private var pageGroups: [[SettingsPage]] {
        page.section.pageGroups.map { group in
            group.filter { candidate in
                guard case .properties(let group) = candidate, let properties, properties.load == .loaded else {
                    return true
                }
                return !properties.categories(of: group).isEmpty
            }
        }
    }

    private var pages: [SettingsPage] { pageGroups.flatMap { $0 } }

    // MARK: Keyboard

    private func move(_ direction: MoveCommandDirection) {
        let step: Int
        switch direction {
        case .up: step = -1
        case .down: step = 1
        default: return
        }
        if isSearching {
            let order = flatResults
            guard !order.isEmpty else { return }
            let current = order.firstIndex { ($0.section == nil ? $0.page.id : $0.id) == activeResultID }
            let next = current.map { min(max($0 + step, 0), order.count - 1) } ?? (step > 0 ? 0 : order.count - 1)
            open(order[next])
        } else {
            let order = pages
            let current = order.firstIndex(of: page) ?? 0
            page = order[min(max(current + step, 0), order.count - 1)]
        }
    }
}

/// A page row: the page's icon and name; tinted while selected or hovered.
struct SettingsSidebarRow: View {
    let title: String
    let symbol: String
    let tint: SettingsTint
    let isSelected: Bool
    let action: () -> Void

    @State private var isHovering = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8, style: .continuous)
        Button(action: action) {
            HStack(spacing: 9) {
                SettingsIconTile(symbol: symbol, tint: tint, size: 22)
                Text(title)
                    .font(.system(size: 13, weight: isSelected ? .medium : .regular))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 7)
            .frame(height: 36)
            .background(shape.fill(Color.primary.opacity(isSelected ? 0.08 : (isHovering ? 0.045 : 0))))
            .contentShape(shape)
        }
        .buttonStyle(.plain)
        .onHover { isHovering = $0 }
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

/// A setting under its page in the search results, with its section.
private struct SettingsSearchResultRow: View {
    let entry: SettingsSearchEntry
    let query: String
    let isSelected: Bool
    let action: () -> Void

    @State private var isHovering = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 8, style: .continuous)
        Button(action: action) {
            VStack(alignment: .leading, spacing: 1) {
                Text(highlighted)
                    .font(.system(size: 12))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                if let section = entry.section, !section.isEmpty {
                    Text(section)
                        .font(.system(size: 10.5))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            // Lines the title up with the page title above (padding + icon + spacing).
            .padding(.leading, 7 + 22 + 9)
            .padding(.trailing, 7)
            .padding(.vertical, 5)
            .background(shape.fill(Color.primary.opacity(isSelected ? 0.08 : (isHovering ? 0.045 : 0))))
            .contentShape(shape)
        }
        .buttonStyle(.plain)
        .onHover { isHovering = $0 }
        .help(entry.detail ?? "")
        .accessibilityLabel([entry.title, entry.section].compactMap { $0 }.joined(separator: ", "))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    /// The title with the matched characters in semibold.
    private var highlighted: AttributedString {
        var text = AttributedString(entry.title)
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if !needle.isEmpty, let range = text.range(of: needle, options: .caseInsensitive) {
            text[range].font = .system(size: 12, weight: .semibold)
        }
        return text
    }
}

/// The server the Server and Properties pages edit, like the account row at
/// the top of System Settings: icon, name, status dot, software and version.
/// Clicking lists the servers to switch to.
private struct SettingsServerCard: View {
    let servers: [ServerProfile]
    let server: ServerProfile?
    let status: (String) -> String
    let select: (String) -> Void

    @State private var isHovering = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        Menu {
            ForEach(servers, id: \.id) { candidate in
                Button {
                    select(candidate.id)
                } label: {
                    if candidate.id == server?.id {
                        Label(candidate.name, systemImage: "checkmark")
                    } else {
                        Text(candidate.name)
                    }
                }
            }
        } label: {
            HStack(spacing: 10) {
                SettingsIconTile(symbol: "server.rack", tint: .green, size: 40)
                    .shadow(color: .black.opacity(0.15), radius: 3, y: 1)
                VStack(alignment: .leading, spacing: 1) {
                    Text(server?.name ?? L10n.t("native.serverSettings.noServer"))
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                        .lineLimit(1)
                    if let server {
                        HStack(spacing: 5) {
                            Circle()
                                .fill(dotColor(status(server.id)))
                                .frame(width: 6, height: 6)
                            Text(verbatim: "\(server.software) \(server.version)")
                                .font(.system(size: 11.5))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 7)
            .frame(height: 56)
            .background(shape.fill(Color.primary.opacity(isHovering ? 0.07 : 0.045)))
            .contentShape(shape)
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
        .disabled(servers.isEmpty)
        .onHover { isHovering = $0 }
        .accessibilityLabel(L10n.t("native.settings.serverCard"))
        .accessibilityValue(server?.name ?? "")
    }

    private func dotColor(_ status: String) -> Color {
        switch status {
        case "online": .green
        case "offline", "crashed": .secondary
        default: .orange
        }
    }
}
