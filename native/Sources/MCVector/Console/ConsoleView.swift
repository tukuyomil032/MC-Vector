// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import MCVectorCore
import SwiftUI

/// The Console (React ConsoleView): address, status and memory, find with
/// regex, a level filter, saving the log, up to five pinned lines, the log
/// itself, and the command line with history.
struct ConsoleView: View {
    let serverID: String
    @Environment(AppState.self) private var app
    @Environment(ServerRuntime.self) private var runtime
    @Environment(FeedbackCenter.self) private var feedback

    @State private var levelFilter: LogLevel?
    @State private var isSearching = false
    @State private var query = ""
    @State private var useRegex = false
    @State private var currentMatch = 0
    @State private var pinnedIDs: [Int] = []
    @State private var isAtBottom = true
    @State private var copied = false
    @FocusState private var searchFocused: Bool

    static let maxPins = 5

    private var server: ServerProfile? { app.servers.first { $0.id == serverID } }
    private var status: String { runtime.status(of: serverID) }
    private var entries: [ServerRuntime.Entry] { runtime.logs[serverID] ?? [] }
    private var visibleEntries: [ServerRuntime.Entry] {
        guard let levelFilter else { return entries }
        return entries.filter { $0.level == levelFilter }
    }

    var body: some View {
        VStack(spacing: 0) {
            toolbar
            if isSearching { searchBar }
            if !pinnedEntries.isEmpty { pinnedArea }
            Divider()
            logArea
            Divider()
            CommandLine(serverID: serverID, isOnline: status == "online")
        }
        .background(.background)
        #if DEBUG
        .onAppear { applyCapturePreset() }
        #endif
    }

    #if DEBUG
    /// Capture tooling: opens the Console with a search, filter or pin set.
    struct CapturePreset {
        var query = ""
        var level: LogLevel?
        var pinFirstWarning = false
    }

    static var capturePreset: CapturePreset?

    private func applyCapturePreset() {
        guard let preset = Self.capturePreset else { return }
        Self.capturePreset = nil
        levelFilter = preset.level
        if !preset.query.isEmpty {
            isSearching = true
            query = preset.query
        }
        if preset.pinFirstWarning, let warning = entries.first(where: { $0.level != .info }) {
            pinnedIDs = [warning.id]
        }
    }
    #endif

    // MARK: Toolbar

    private var toolbar: some View {
        HStack(spacing: 12) {
            Button {
                copyAddress()
            } label: {
                Label(copied ? L10n.t("console.status.copied") : address, systemImage: "network")
                    .monospacedDigit()
            }
            .buttonStyle(.borderless)
            .help(L10n.t("console.status.clickToCopy"))

            Label {
                Text(L10n.t(ServerStatusStyle.labelKey(status)))
            } icon: {
                Image(systemName: "circle.fill")
                    .font(.system(size: 7))
                    .foregroundStyle(ServerStatusStyle.color(status))
            }
            .foregroundStyle(.secondary)

            if status == "online", let memory = memoryText {
                LabeledContent(L10n.t("console.status.memory"), value: memory)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }

            Spacer()

            Button {
                isSearching.toggle()
                searchFocused = isSearching
            } label: {
                Label(L10n.t("console.actions.find"), systemImage: "magnifyingglass")
            }
            .keyboardShortcut("f", modifiers: .command)
            .help(L10n.t("console.actions.find"))

            Picker(L10n.t("console.filter.ariaLabel"), selection: $levelFilter) {
                Text(L10n.t("console.filter.all")).tag(LogLevel?.none)
                ForEach(LogLevel.allInOrder, id: \.self) { level in
                    Text(level.name).tag(LogLevel?.some(level))
                }
            }
            .labelsHidden()
            .fixedSize()

            Button {
                saveLogs()
            } label: {
                Label(L10n.t("console.actions.saveLogs"), systemImage: "square.and.arrow.down")
            }
            .help(L10n.t("console.actions.saveLogs"))
        }
        .labelStyle(.titleAndIcon)
        .controlSize(.small)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private var address: String {
        "localhost:\(server?.port ?? 25_565)"
    }

    private var memoryText: String? {
        guard let used = runtime.memoryBytes[serverID] else { return nil }
        let usedMB = used / 1_048_576
        let total = server?.memoryMb.map(String.init) ?? "–"
        return L10n.t("console.memory.value", ["used": usedMB, "total": total, "unit": L10n.t("console.memory.unit")])
    }

    private func copyAddress() {
        NSPasteboard.general.clearContents()
        guard NSPasteboard.general.setString(address, forType: .string) else {
            feedback.toast(.error, L10n.t("console.toast.copyFailed"))
            return
        }
        copied = true
        Task {
            try? await Task.sleep(for: .seconds(1.6))
            copied = false
        }
    }

    private func saveLogs() {
        guard !entries.isEmpty else {
            feedback.toast(.info, L10n.t("console.toast.noLogsToSave"))
            return
        }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "\(server?.name ?? serverID)-console.log"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            try entries.map(\.text).joined(separator: "\n").appending("\n")
                .write(to: url, atomically: true, encoding: .utf8)
            feedback.toast(.success, L10n.t("console.toast.logsSaved"))
        } catch {
            feedback.toast(.error, L10n.t("console.toast.logsSaveFailed"))
        }
    }

    // MARK: Search

    private var matcher: Result<(String) -> Bool, Error>? {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return nil }
        if useRegex {
            do {
                let regex = try Regex(trimmed).ignoresCase()
                return .success { $0.contains(regex) }
            } catch {
                return .failure(error)
            }
        }
        return .success { $0.localizedCaseInsensitiveContains(trimmed) }
    }

    private var matchIDs: [Int] {
        guard case let .success(matches)? = matcher else { return [] }
        return visibleEntries.filter { matches($0.text) }.map(\.id)
    }

    private var searchBar: some View {
        let matches = matchIDs
        return HStack(spacing: 8) {
            TextField(L10n.t("console.search.label"), text: $query, prompt: Text(L10n.t("console.search.placeholder")))
                .textFieldStyle(.roundedBorder)
                .focused($searchFocused)
                .onSubmit { step(1, in: matches) }
                .onChange(of: query) { currentMatch = 0 }
            if case .failure? = matcher {
                FieldError(L10n.t("console.search.invalidRegex"))
                    .font(.caption)
            } else if !matches.isEmpty {
                Text(L10n.t("console.search.count", ["current": currentMatch + 1, "total": matches.count]))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            Toggle(L10n.t("console.search.regex"), isOn: $useRegex)
                .toggleStyle(.button)
            ControlGroup {
                Button { step(-1, in: matches) } label: { Image(systemName: "chevron.up") }
                    .help(L10n.t("console.search.prev"))
                Button { step(1, in: matches) } label: { Image(systemName: "chevron.down") }
                    .help(L10n.t("console.search.next"))
            }
            .disabled(matches.isEmpty)
            .fixedSize()
            Button {
                isSearching = false
                query = ""
            } label: {
                Image(systemName: "xmark.circle.fill")
            }
            .buttonStyle(.borderless)
            .keyboardShortcut(.cancelAction)
            .help(L10n.t("common.close"))
        }
        .controlSize(.small)
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }

    @State private var scrollTarget: Int?

    private func step(_ delta: Int, in matches: [Int]) {
        guard !matches.isEmpty else { return }
        currentMatch = (currentMatch + delta + matches.count) % matches.count
        scrollTarget = matches[currentMatch]
    }

    // MARK: Pins

    private var pinnedEntries: [ServerRuntime.Entry] {
        let byID = Dictionary(entries.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return pinnedIDs.compactMap { byID[$0] }
    }

    private func togglePin(_ entry: ServerRuntime.Entry) {
        if let index = pinnedIDs.firstIndex(of: entry.id) {
            pinnedIDs.remove(at: index)
        } else if pinnedIDs.count >= Self.maxPins {
            feedback.toast(.warning, L10n.t("console.toast.pinLimitReached", ["max": Self.maxPins]))
        } else {
            pinnedIDs.append(entry.id)
        }
    }

    private var pinnedArea: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(L10n.t("console.pinned.title"), systemImage: "pin.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            ForEach(pinnedEntries) { entry in
                LogRow(entry: entry, isPinned: true, isMatch: false) { togglePin(entry) }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(.quaternary.opacity(0.4))
    }

    // MARK: Log

    private var logArea: some View {
        let visible = visibleEntries
        let currentID = matchIDs.indices.contains(currentMatch) ? matchIDs[currentMatch] : nil
        return ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(visible) { entry in
                        LogRow(entry: entry, isPinned: pinnedIDs.contains(entry.id), isMatch: entry.id == currentID) {
                            togglePin(entry)
                        }
                        .id(entry.id)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
            }
            // Lines start at the top while they fit; once they overflow, the view
            // opens at the newest line and stays there as lines arrive.
            .defaultScrollAnchor(.top, for: .alignment)
            .defaultScrollAnchor(.bottom, for: .initialOffset)
            .defaultScrollAnchor(.bottom, for: .sizeChanges)
            .onScrollGeometryChange(for: Bool.self) { geometry in
                // React pauses auto-scroll more than 120 px above the bottom.
                geometry.contentSize.height - geometry.visibleRect.maxY < 120
            } action: { _, atBottom in
                isAtBottom = atBottom
            }
            .onChange(of: visible.last?.id) { _, last in
                if isAtBottom, let last { proxy.scrollTo(last, anchor: .bottom) }
            }
            .onChange(of: scrollTarget) { _, target in
                if let target { withAnimation { proxy.scrollTo(target, anchor: .center) } }
            }
            .overlay {
                if visible.isEmpty {
                    Text(levelFilter.map { L10n.t("console.emptyLog.notFound", ["level": $0.name]) }
                        ?? L10n.t("console.emptyLog.waiting"))
                        .foregroundStyle(.secondary)
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if !isAtBottom, let last = visible.last {
                    Button {
                        withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                    } label: {
                        Label(L10n.t("console.actions.jumpLatest"), systemImage: "arrow.down.to.line")
                    }
                    .controlSize(.small)
                    .buttonStyle(.borderedProminent)
                    .padding(12)
                }
            }
        }
    }
}

/// One console line: monospaced text colored by level, with a pin button on hover.
private struct LogRow: View {
    let entry: ServerRuntime.Entry
    let isPinned: Bool
    let isMatch: Bool
    let togglePin: () -> Void
    @State private var isHovered = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(entry.text)
                .font(.system(.callout, design: .monospaced))
                .fontWeight(entry.level == .info ? .regular : .semibold)
                .foregroundStyle(entry.level.color)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: togglePin) {
                Image(systemName: isPinned ? "pin.slash" : "pin")
            }
            .buttonStyle(.borderless)
            .opacity(isHovered || isPinned ? 1 : 0)
            .help(L10n.t(isPinned ? "console.pinned.unpin" : "console.pinned.pin"))
        }
        .padding(.vertical, 1)
        .padding(.leading, entry.level == .info ? 0 : 4)
        .overlay(alignment: .leading) {
            // React marks warnings and errors with a left border.
            if entry.level != .info {
                Rectangle().fill(entry.level.color).frame(width: 2)
            }
        }
        .background(isMatch ? Color.accentColor.opacity(0.25) : .clear)
        .onHover { isHovered = $0 }
    }
}

/// `>` prompt, input and Send, with ↑/↓ history (100 entries per server).
private struct CommandLine: View {
    let serverID: String
    let isOnline: Bool
    @Environment(ServerRuntime.self) private var runtime
    @Environment(FeedbackCenter.self) private var feedback
    @State private var text = ""
    @State private var history: [String] = []
    @State private var historyIndex: Int?
    @State private var draft = ""
    @State private var isSending = false

    static let maxHistory = 100
    private var historyKey: String { "console-history:\(serverID)" }

    var body: some View {
        HStack(spacing: 8) {
            Text(">")
                .font(.system(.body, design: .monospaced))
                .foregroundStyle(.secondary)
            TextField(L10n.t("console.command.label"), text: $text, prompt: Text(L10n.t("console.command.placeholder")))
                .textFieldStyle(.plain)
                .font(.system(.body, design: .monospaced))
                .onSubmit { Task { await send() } }
                .onKeyPress(.upArrow) { recall(-1); return .handled }
                .onKeyPress(.downArrow) { recall(1); return .handled }
            Button(L10n.t("console.actions.send")) { Task { await send() } }
                .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty || isSending)
        }
        .disabled(!isOnline)
        .help(isOnline ? "" : L10n.t("console.command.offlineHint"))
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .onAppear { history = UserDefaults.standard.stringArray(forKey: historyKey) ?? [] }
    }

    private func send() async {
        let command = text.trimmingCharacters(in: .whitespaces)
        guard isOnline, !command.isEmpty, !isSending else { return }
        isSending = true
        defer { isSending = false }
        do throws(CoreError) {
            try await runtime.send(command, to: serverID)
        } catch {
            // Unlike React, the input stays so the command can be fixed or resent.
            feedback.showError(L10n.t("native.console.sendFailed"), message: error.uiText)
            return
        }
        if history.last != command { history.append(command) }
        if history.count > Self.maxHistory { history.removeFirst(history.count - Self.maxHistory) }
        UserDefaults.standard.set(history, forKey: historyKey)
        text = ""
        historyIndex = nil
        draft = ""
    }

    /// ↑ goes back in history, ↓ forward; the unsent draft comes back at the end.
    private func recall(_ delta: Int) {
        guard !history.isEmpty else { return }
        if historyIndex == nil {
            guard delta < 0 else { return }
            draft = text
            historyIndex = history.count
        }
        let next = (historyIndex ?? history.count) + delta
        if next >= history.count {
            historyIndex = nil
            text = draft
        } else {
            historyIndex = max(0, next)
            text = history[historyIndex ?? 0]
        }
    }
}

extension LogLevel {
    static let allInOrder: [LogLevel] = [.info, .warn, .error, .fatal]

    /// React shows the level names as they are.
    var name: String {
        switch self {
        case .info: "INFO"
        case .warn: "WARN"
        case .error: "ERROR"
        case .fatal: "FATAL"
        }
    }

    var color: Color {
        switch self {
        case .info: .secondary
        case .warn: .orange
        case .error, .fatal: .red
        }
    }
}
