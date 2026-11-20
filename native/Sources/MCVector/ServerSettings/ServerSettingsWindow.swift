// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import MCVectorCore
import SwiftUI

/// The Server Settings window (UI-014): General Settings and server.properties
/// for one server, laid out like Snapzy's and Droppy's settings. The sidebar
/// has search, the server menu, the two section tiles and the section's
/// categories; the right side is a grouped form with Save at the bottom.
struct ServerSettingsWindow: View {
    static let windowID = "server-settings"

    @Environment(AppState.self) private var app
    @Environment(ServerRuntime.self) private var runtime
    /// Toasts and errors stay in this window instead of the main one.
    @State private var feedback = FeedbackCenter()

    @State private var serverID: String?
    @State private var page: ServerSettingsPage? = .overview(.general)
    @State private var history = PageHistory()
    @State private var search = ""
    @State private var properties: PropertiesModel?
    @State private var general: GeneralSettingsModel?
    /// A server switch or window close waiting for Save / Discard / Cancel.
    @State private var pendingLeave: PendingLeave?
    @State private var window: NSWindow?
    /// Read by the close guard, which lives outside SwiftUI's state.
    @State private var closeState = CloseState()

    @MainActor
    final class CloseState {
        var isDirty = false
        var blocked: () -> Void = {}
    }

    enum PendingLeave: Equatable {
        case server(String)
        case close
    }

    private var section: ServerSettingsSection { page?.section ?? .general }
    private var server: ServerProfile? { app.servers.first { $0.id == serverID } }
    private var isDirty: Bool { properties?.isDirty == true || general?.isDirty == true }
    private var isSaving: Bool { properties?.isSaving == true || general?.isSaving == true }
    private var justSaved: Bool { properties?.justSaved == true || general?.justSaved == true }

    var body: some View {
        NavigationSplitView {
            sidebar
                .searchable(text: $search, placement: .sidebar, prompt: Text(L10n.t("native.serverSettings.search")))
                .navigationSplitViewColumnWidth(min: 250, ideal: 270, max: 320)
                .toolbar(removing: .sidebarToggle)
        } detail: {
            detail
                .navigationTitle(title)
                .toolbar { navigationArrows }
        }
        .frame(minWidth: 760, minHeight: 520)
        .overlay(alignment: .top) { ToastHUD(feedback: feedback) }
        .feedbackHost(feedback)
        .environment(feedback)
        .background(
            WindowAccessor { found in
                window = found
                let state = closeState
                state.blocked = { pendingLeave = .close }
                CloseGuard.install(on: found) {
                    guard state.isDirty else { return true }
                    state.blocked()
                    return false
                }
            }
        )
        .onAppear { take(app.serverSettingsRequest) }
        .onChange(of: app.serverSettingsRequest) { _, request in take(request) }
        .onChange(of: isDirty) { _, dirty in closeState.isDirty = dirty }
        .onChange(of: page) { _, newPage in if let newPage { history.visit(newPage) } }
        .task(id: serverID) { await loadProperties() }
        .alert(
            L10n.t("files.confirm.discardChangesTitle"),
            isPresented: Binding(get: { pendingLeave != nil }, set: { if !$0 { pendingLeave = nil } }),
            presenting: pendingLeave
        ) { leave in
            Button(L10n.t("common.save")) { Task { if await save() { finish(leave) } } }
                .keyboardShortcut(.defaultAction)
            Button(L10n.t("files.confirm.discardButton"), role: .destructive) {
                discardAll()
                finish(leave)
            }
            Button(L10n.t("common.cancel"), role: .cancel) { pendingLeave = nil }
        } message: { _ in
            Text(L10n.t("unsavedChanges.description"))
        }
    }

    // MARK: Sidebar

    private var sidebar: some View {
        List(selection: $page) {
            Section {
                serverMenu
                    .selectionDisabled()
                HStack(spacing: 8) {
                    ForEach(ServerSettingsSection.allCases, id: \.self) { tile in
                        SettingsBigTile(
                            title: L10n.t(tile.tileTitleKey), symbol: tile.symbol, isSelected: section == tile
                        ) {
                            withAnimation(Motion.standard) { page = .overview(tile) }
                        }
                    }
                }
                .selectionDisabled()
                .listRowInsets(EdgeInsets(top: 6, leading: 8, bottom: 10, trailing: 8))
            }
            Section {
                ForEach(categories, id: \.id) { category in
                    Label {
                        Text(category.title)
                    } icon: {
                        SettingsIconTile(symbol: category.symbol, color: category.tint)
                    }
                    .tag(ServerSettingsPage.category(section, category.id))
                }
            }
            .id(section)
            .transition(.motionFade)
        }
        .listStyle(.sidebar)
        // The split view restores a too narrow sidebar otherwise.
        .frame(minWidth: 250, idealWidth: 270)
        .animation(Motion.standard, value: section)
    }

    private var serverMenu: some View {
        Menu {
            ForEach(app.servers, id: \.id) { candidate in
                Button {
                    requestServer(candidate.id)
                } label: {
                    if candidate.id == serverID {
                        Label(candidate.name, systemImage: "checkmark")
                    } else {
                        Text(candidate.name)
                    }
                }
            }
        } label: {
            HStack(spacing: 10) {
                SettingsIconTile(symbol: "server.rack", color: .green, size: 34)
                VStack(alignment: .leading, spacing: 1) {
                    Text(server?.name ?? L10n.t("native.serverSettings.noServer"))
                        .font(.headline)
                        .lineLimit(1)
                    Text(server.map { "\($0.software) \($0.version)" } ?? "")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .contentShape(Rectangle())
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
        .padding(.vertical, 4)
    }

    private struct SidebarCategory: Identifiable {
        let id: String
        let title: String
        let symbol: String
        let tint: Color
    }

    private var categories: [SidebarCategory] {
        switch section {
        case .properties:
            (properties?.visibleCategories ?? PropertiesLayout.bundled.categories).map {
                SidebarCategory(id: $0.id, title: $0.title.current, symbol: $0.symbol, tint: $0.tint)
            }
        case .general:
            GeneralSettingsCategory.allCases.map {
                SidebarCategory(id: $0.rawValue, title: L10n.t($0.titleKey), symbol: $0.symbol, tint: $0.tint)
            }
        }
    }

    // MARK: Detail

    private var title: String {
        if case .category(_, let id) = page, let category = categories.first(where: { $0.id == id }) {
            return category.title
        }
        return L10n.t(section.titleKey)
    }

    @ViewBuilder
    private var detail: some View {
        Group {
            if server == nil {
                ContentUnavailableView(L10n.t("native.serverSettings.noServer"), systemImage: "server.rack")
            } else {
                switch section {
                case .properties:
                    if let properties {
                        PropertiesPage(page: page ?? .overview(.properties), search: search, model: properties) {
                            page = $0
                        }
                    }
                case .general:
                    if let general {
                        GeneralSettingsPage(page: page ?? .overview(.general), search: search, model: general) {
                            page = $0
                        }
                    }
                }
            }
        }
        .id(page)
        .transition(.motionFade)
        .animation(Motion.standard, value: page)
        .safeAreaInset(edge: .bottom) { saveBar }
    }

    @ViewBuilder
    private var saveBar: some View {
        if isDirty || justSaved {
            HStack(spacing: 12) {
                if isDirty {
                    Label(L10n.t("properties.unsavedChanges"), systemImage: "circle.fill")
                        .labelStyle(DotLabelStyle())
                        .foregroundStyle(.orange)
                }
                Spacer()
                if isDirty {
                    Button(L10n.t("common.discard")) { discardAll() }
                        .disabled(isSaving)
                }
                Button {
                    Task { await save() }
                } label: {
                    ZStack {
                        Text(L10n.t("properties.saveChanges")).opacity(isSaving ? 0 : 1)
                        if isSaving { ProgressView().controlSize(.small) }
                    }
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut("s", modifiers: .command)
                .disabled(!isDirty || isSaving)
            }
            .controlSize(.large)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(.bar)
            .overlay(alignment: .top) { Divider() }
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    @ToolbarContentBuilder
    private var navigationArrows: some ToolbarContent {
        ToolbarItemGroup(placement: .navigation) {
            Button {
                if let previous = history.back() { page = previous }
            } label: {
                Label(L10n.t("native.serverSettings.back"), systemImage: "chevron.left")
            }
            .disabled(!history.canGoBack)
            Button {
                if let next = history.forward() { page = next }
            } label: {
                Label(L10n.t("native.serverSettings.forward"), systemImage: "chevron.right")
            }
            .disabled(!history.canGoForward)
        }
    }

    // MARK: Actions

    private func take(_ request: ServerSettingsRequest?) {
        guard let request else { return }
        app.serverSettingsRequest = nil
        let target = request.serverID ?? app.selectedServerID ?? app.servers.first?.id
        if serverID == nil {
            serverID = target
        } else if let target, target != serverID {
            requestServer(target)
        }
        page = request.page ?? .overview(request.section)
        window?.makeKeyAndOrderFront(nil)
    }

    private func requestServer(_ id: String) {
        guard id != serverID else { return }
        if isDirty {
            pendingLeave = .server(id)
        } else {
            serverID = id
        }
    }

    private func finish(_ leave: PendingLeave) {
        pendingLeave = nil
        switch leave {
        case .server(let id): serverID = id
        case .close:
            closeState.isDirty = false
            window?.close()
        }
    }

    private func loadProperties() async {
        guard let serverID, let server else {
            properties = nil
            general = nil
            return
        }
        // The task can start twice for the same server while the window opens;
        // a second model would leave the screen showing the first one.
        guard properties?.serverID != serverID else { return }
        let model = PropertiesModel(serverID: serverID, software: server.software, version: server.version)
        properties = model
        let generalModel = GeneralSettingsModel(serverID: serverID)
        general = generalModel
        Task { await generalModel.reload() }
        await model.reload(software: server.software, version: server.version)
        #if DEBUG
            if let script = Self.captureScript {
                Self.captureScript = nil
                if let query = script.search { search = query }
                for (key, value) in script.values { model.values[key] = value }
                if let key = script.reveal { model.captureRevealKey = key }
            }
        #endif
    }

    #if DEBUG
        /// Capture tooling: what to do once the properties have loaded.
        struct CaptureScript {
            var search: String?
            var values: [String: String] = [:]
            var reveal: String?
        }

        static var captureScript: CaptureScript?
    #endif

    private func discardAll() {
        properties?.discard()
        general?.discard()
    }

    /// Saves whichever halves changed. General first: a port change there also
    /// rewrites server.properties, which the Properties half then reloads.
    @discardableResult
    private func save() async -> Bool {
        guard let serverID else { return false }
        var ok = true
        if let general, general.isDirty {
            if let result = await general.save(feedback: feedback) {
                if result.settings.port != UInt16(server?.port ?? 0) || result.settings.name != server?.name {
                    await app.reloadServers(selectFirstIfMissing: false)
                    if properties?.isDirty == false { await properties?.reloadAgain() }
                }
            } else {
                ok = false
            }
        }
        if let properties, properties.isDirty {
            let running = runtime.status(of: serverID) == "online"
            if let result = await properties.save(isRunning: running, feedback: feedback) {
                if result.portChangedTo != nil {
                    await app.reloadServers(selectFirstIfMissing: false)
                    await general?.reload()
                }
            } else {
                ok = false
            }
        }
        return ok
    }
}

/// The orange dot and "Unsaved changes" text.
private struct DotLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            configuration.icon.font(.system(size: 7))
            configuration.title.font(.callout)
        }
    }
}

/// Hands the hosting NSWindow to SwiftUI.
private struct WindowAccessor: NSViewRepresentable {
    let found: (NSWindow) -> Void

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async { if let window = view.window { found(window) } }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

/// Asks before the window closes with unsaved changes. SwiftUI owns the
/// window's delegate, so this one forwards everything else to it.
@MainActor
private final class CloseGuard: NSObject, NSWindowDelegate {
    private weak var original: (any NSWindowDelegate)?
    private let shouldClose: () -> Bool
    private static var guards: [ObjectIdentifier: CloseGuard] = [:]

    private init(original: (any NSWindowDelegate)?, shouldClose: @escaping () -> Bool) {
        self.original = original
        self.shouldClose = shouldClose
    }

    static func install(on window: NSWindow, shouldClose: @escaping () -> Bool) {
        guard !(window.delegate is CloseGuard) else { return }
        let closeGuard = CloseGuard(original: window.delegate, shouldClose: shouldClose)
        guards[ObjectIdentifier(window)] = closeGuard
        window.delegate = closeGuard
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        guard shouldClose() else { return false }
        return original?.windowShouldClose?(sender) ?? true
    }

    override func responds(to selector: Selector!) -> Bool {
        super.responds(to: selector) || (original?.responds(to: selector) ?? false)
    }

    override func forwardingTarget(for selector: Selector!) -> Any? {
        original?.responds(to: selector) == true ? original : super.forwardingTarget(for: selector)
    }
}
