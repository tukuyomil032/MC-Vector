// SPDX-License-Identifier: GPL-3.0-or-later

import MCVectorCore
import SwiftUI

/// Users (UI-009, React UsersView): whitelist, operators, banned players and
/// banned IPs as four cards, each with its rows, a count and an add field.
struct UsersView: View {
    @Environment(ServerRuntime.self) private var runtime
    @Environment(FeedbackCenter.self) private var feedback
    @State private var model: UsersModel
    /// The row waiting for the Remove confirmation.
    @State private var pendingRemove: PendingRemove?
#if DEBUG
    struct CaptureScript {
        enum Action {
            case none
            case holdLoading
            case submitEmpty
            case pendingAdd(String)
            case confirmRemove(String)
            case add(String)
            case remove(String)
            case addAndShowConsole(String)
        }

        let id: String
        let action: Action
    }

    static var captureScript: CaptureScript?
#endif

    struct PendingRemove: Identifiable {
        let list: PlayerListKind
        let identifier: String
        var id: String { "\(list)-\(identifier)" }
    }

    init(serverID: String) {
        _model = State(initialValue: UsersModel(serverID: serverID))
    }

    var body: some View {
        Group {
            if case let .failed(error) = model.load, !model.hasLoaded {
                ContentUnavailableView {
                    Label(L10n.t("users.loadFailed"), systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error.uiText)
                } actions: {
                    Button(L10n.t("users.retry")) { Task { await model.reload() } }
                }
                .transition(.motionFade)
            } else {
                ScrollView {
                    LazyVGrid(
                        columns: [GridItem(.adaptive(minimum: 340), spacing: 16, alignment: .top)],
                        spacing: 16
                    ) {
                        ForEach(UsersList.all) { list in
                            UsersCard(
                                list: list, model: model,
                                requestRemove: { pendingRemove = PendingRemove(list: list.kind, identifier: $0) }
                            )
                        }
                    }
                    .padding(20)
                }
                .transition(.motionFade)
            }
        }
        .animation(Motion.standard, value: model.hasLoaded)
        .task {
#if DEBUG
            let script = Self.captureScript
            if let script, case .holdLoading = script.action {
                try? await Task.sleep(for: .milliseconds(400))
                CaptureState.markViewReady(for: script.id)
                // Keep the first-load placeholders on screen for this capture.
                try? await Task.sleep(for: .seconds(30))
                return
            }
#endif
            await model.reload()
#if DEBUG
            if let script {
                switch script.action {
                case let .confirmRemove(name):
                    if model.hasLoaded {
                        pendingRemove = PendingRemove(list: .whitelist, identifier: name)
                    }
                    try? await Task.sleep(for: .milliseconds(350))
                    CaptureState.markViewReady(for: script.id)
                case .none:
                    try? await Task.sleep(for: .milliseconds(350))
                    CaptureState.markViewReady(for: script.id)
                case .holdLoading:
                    break
                case .submitEmpty, .pendingAdd, .add, .remove, .addAndShowConsole:
                    break
                }
            }
#endif
        }
        .confirmationDialog(
            L10n.t("users.removeTitle"),
            isPresented: Binding(get: { pendingRemove != nil }, set: { if !$0 { pendingRemove = nil } }),
            presenting: pendingRemove
        ) { pending in
            Button(L10n.t("users.actions.remove"), role: .destructive) {
                Task { await model.remove(pending.identifier, from: pending.list, runtime: runtime, feedback: feedback) }
            }
        } message: { pending in
            Text(L10n.t("users.confirmRemove", ["name": pending.identifier]))
        }
    }
}

/// What each card shows.
struct UsersList: Identifiable {
    let kind: PlayerListKind
    let titleKey: String
    let emptyKey: String
    let symbol: String
    let tint: Color

    var id: String { titleKey }
    var isIP: Bool { kind == .bannedIps }

    static let all: [UsersList] = [
        UsersList(
            kind: .whitelist, titleKey: "users.lists.whitelist", emptyKey: "users.emptyList.whitelist.title",
            symbol: "checkmark.shield", tint: .green),
        UsersList(
            kind: .ops, titleKey: "users.lists.operators", emptyKey: "users.emptyList.ops.title",
            symbol: "crown", tint: .orange),
        UsersList(
            kind: .bannedPlayers, titleKey: "users.lists.bannedPlayers",
            emptyKey: "users.emptyList.bannedPlayers.title", symbol: "person.crop.circle.badge.xmark", tint: .red),
        UsersList(
            kind: .bannedIps, titleKey: "users.lists.bannedIps", emptyKey: "users.emptyList.bannedIps.title",
            symbol: "nosign", tint: .red),
    ]
}

private struct UsersCard: View {
    let list: UsersList
    let model: UsersModel
    let requestRemove: (String) -> Void

    @Environment(ServerRuntime.self) private var runtime
    @Environment(FeedbackCenter.self) private var feedback
#if DEBUG
    @Environment(AppState.self) private var app
#endif
    @State private var text = ""
    @State private var fieldError: String?
    @FocusState private var focused: Bool

    private static let listHeight: CGFloat = 220

    var body: some View {
        let entries = model.entries(list.kind)
        DashboardCard(
            title: L10n.t(list.titleKey), symbol: list.symbol, tint: list.tint,
            accessory: AnyView(count(entries.count))
        ) {
            VStack(alignment: .leading, spacing: 12) {
                rows(entries)
                    .frame(height: Self.listHeight)
                addField
            }
        }
#if DEBUG
        .task(id: model.hasLoaded) {
            guard model.hasLoaded, let captureScript = UsersView.captureScript else { return }
            await runCaptureScript(captureScript)
        }
#endif
    }

    private func count(_ value: Int) -> some View {
        Text("\(value)")
            .font(.callout.monospacedDigit())
            .foregroundStyle(.secondary)
            .contentTransition(.numericText(value: Double(value)))
            .animation(Motion.value, value: value)
            .opacity(model.hasLoaded ? 1 : 0)
    }

    @ViewBuilder
    private func rows(_ entries: [PlayerEntry]) -> some View {
        if !model.hasLoaded {
            // Placeholder rows while the first load runs (React skeleton).
            VStack(alignment: .leading, spacing: 10) {
                ForEach(0..<3, id: \.self) { _ in
                    UserRow(entry: .placeholder, isIP: list.isIP, remove: {})
                }
                Spacer(minLength: 0)
            }
            .redacted(reason: .placeholder)
            .allowsHitTesting(false)
        } else if entries.isEmpty {
            Text(L10n.t(list.emptyKey))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .transition(.motionFade)
        } else {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    ForEach(entries, id: \.self) { entry in
                        let identifier = list.isIP ? (entry.ip ?? "") : entry.name
                        UserRow(entry: entry, isIP: list.isIP) { requestRemove(identifier) }
                            .transition(.motionFade.combined(with: .move(edge: .top)))
                    }
                }
            }
            .scrollIndicators(.automatic)
            .transition(.motionFade)
        }
    }

    private var addField: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                TextField(
                    L10n.t(list.isIP ? "users.placeholder.ipAddress" : "users.placeholder.playerName"), text: $text
                )
                .textFieldStyle(.roundedBorder)
                .autocorrectionDisabled()
                .focused($focused)
                .onSubmit(submit)
                .onChange(of: text) { if fieldError != nil { withAnimation(Motion.snappy) { fieldError = nil } } }
                Button(action: submit) {
                    ZStack {
                        Text(L10n.t("users.actions.add")).opacity(isPending ? 0 : 1)
                        if isPending { ProgressView().controlSize(.small) }
                    }
                }
                .disabled(isPending || !model.hasLoaded)
            }
            .controlSize(.large)
            if let fieldError {
                Text(fieldError)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .transition(.motionFade)
            }
        }
    }

    private var isPending: Bool { model.pendingAdds.contains(list.kind) }

    private func submit() {
        guard !isPending else { return }
        Task { await performSubmit() }
    }

    private func performSubmit() async {
        switch await model.add(text, to: list.kind, runtime: runtime, feedback: feedback) {
        case .done:
            text = ""
        case let .invalid(message):
            withAnimation(Motion.snappy) { fieldError = message }
            focused = true
        case .failed:
            break
        }
    }

#if DEBUG
    private func runCaptureScript(_ script: UsersView.CaptureScript) async {
        guard list.kind == .whitelist else { return }
        switch script.action {
        case .none, .holdLoading, .confirmRemove:
            return
        case .submitEmpty:
            text = ""
            await performSubmit()
            try? await Task.sleep(for: .milliseconds(250))
            CaptureState.markViewReady(for: script.id)
        case let .pendingAdd(value):
            text = value
            model.capturePendingAddDelay = .seconds(8)
            Task { await performSubmit() }
            for _ in 0..<100 where !model.pendingAdds.contains(list.kind) {
                try? await Task.sleep(for: .milliseconds(20))
            }
            try? await Task.sleep(for: .milliseconds(250))
            CaptureState.markViewReady(for: script.id)
        case let .add(value):
            text = value
            await performSubmit()
            try? await Task.sleep(for: .milliseconds(250))
            CaptureState.markViewReady(for: script.id)
        case let .remove(value):
            await model.remove(value, from: .whitelist, runtime: runtime, feedback: feedback)
            try? await Task.sleep(for: .milliseconds(250))
            CaptureState.markViewReady(for: script.id)
        case let .addAndShowConsole(value):
            text = value
            await performSubmit()
            app.navigate(to: .console)
            try? await Task.sleep(for: .milliseconds(400))
            CaptureState.markViewReady(for: script.id)
        }
    }
#endif
}

private struct UserRow: View {
    let entry: PlayerEntry
    let isIP: Bool
    let remove: () -> Void

    @State private var isHovered = false

    var body: some View {
        HStack(spacing: 10) {
            UserAvatar(name: entry.name, isIP: isIP)
            VStack(alignment: .leading, spacing: 1) {
                Text(isIP ? (entry.ip ?? "") : entry.name)
                    .lineLimit(1)
                if let meta {
                    Text(meta)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            Button(L10n.t("users.actions.remove"), action: remove)
                .buttonStyle(.borderless)
                .foregroundStyle(isHovered ? Color.red : Color.secondary)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(
            isHovered ? AnyShapeStyle(.quaternary) : AnyShapeStyle(.clear),
            in: RoundedRectangle(cornerRadius: 7, style: .continuous)
        )
        .onHover { hovering in withAnimation(Motion.snappy) { isHovered = hovering } }
    }

    /// Reason and operator level, like React's row meta.
    private var meta: String? {
        let parts = [entry.reason, entry.level.map { L10n.t("users.level", ["level": "\($0)"]) }]
            .compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

/// The player's face from minotar.net, then Steve's, then a person symbol.
/// IP rows show a globe.
private struct UserAvatar: View {
    let name: String
    let isIP: Bool
    @State private var stage = 0

    var body: some View {
        Group {
            if isIP {
                symbol("globe")
            } else if stage < 2 {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case let .success(image):
                        image.resizable().interpolation(.none)
                    case .failure:
                        Color.clear.onAppear { stage += 1 }
                    default:
                        Color.secondary.opacity(0.15)
                    }
                }
                .id(stage)
            } else {
                symbol("person.fill")
            }
        }
        .frame(width: 28, height: 28)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    private var url: URL? {
        let player = stage == 0 ? name : "MHF_Steve"
        let encoded = player.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? player
        return URL(string: "https://minotar.net/avatar/\(encoded)/64")
    }

    private func symbol(_ name: String) -> some View {
        Image(systemName: name)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(.secondary)
            .frame(width: 28, height: 28)
            .background(.quaternary)
    }
}

extension PlayerEntry {
    /// Stand-in row for the loading placeholder.
    static let placeholder = PlayerEntry(
        uuid: nil, name: "Placeholder", level: nil, created: nil, source: nil, expires: nil,
        reason: "Loading", ip: "000.000.000.000", bypassesPlayerLimit: nil)
}
