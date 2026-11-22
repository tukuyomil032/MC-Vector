// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import GlassKit
import MCVectorCore
import SwiftUI

/// The Settings window (UI-014): the app's settings, and a server's General
/// Settings and server.properties, laid out like Snapzy's settings. The
/// sidebar has search, the server card, the three section tiles and the
/// section's pages; the right side is a grouped form, with Save at the bottom
/// on the server pages.
struct SettingsWindow: View {
    static let windowID = "settings"

    @Environment(AppState.self) private var app
    @Environment(ServerRuntime.self) private var runtime
    /// Toasts and errors stay in this window instead of the main one.
    @State private var feedback = FeedbackCenter()

    @State private var serverID: String?
    @State private var page: SettingsPage = Self.initialPage
    @State private var history = PageHistory()
    @State private var query = ""
    @State private var properties: PropertiesModel?
    @State private var general: GeneralSettingsModel?
    /// A row the search asked to show; the detail scrolls to it.
    @State private var reveal: Reveal?
    @State private var highlight: String?
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

    struct Reveal: Equatable {
        let id = UUID()
        let title: String
    }

    private static var initialPage: SettingsPage {
        #if DEBUG
            if let page = CaptureState.requestedSettingsPage { return page }
        #endif
        return .app(.general)
    }

    private var server: ServerProfile? { app.servers.first { $0.id == serverID } }
    private var isDirty: Bool { properties?.isDirty == true || general?.isDirty == true }
    private var isSaving: Bool { properties?.isSaving == true || general?.isSaving == true }
    private var justSaved: Bool { properties?.justSaved == true || general?.justSaved == true }

    var body: some View {
        NavigationSplitView {
            SettingsSidebar(
                page: $page, query: $query, servers: app.servers, serverID: serverID,
                status: { runtime.status(of: $0) }, properties: properties,
                selectServer: requestServer, reveal: open
            )
            // The split view restores a too narrow sidebar without the frame.
            .frame(width: 268)
            .navigationSplitViewColumnWidth(min: 268, ideal: 268, max: 268)
            .toolbar(removing: .sidebarToggle)
        } detail: {
            detail
                .navigationTitle(page.title)
                .navigationSplitViewColumnWidth(min: 480, ideal: 620)
                .toolbar { navigationArrows }
        }
        .frame(minWidth: 780, minHeight: 560)
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
        .onAppear {
            history.visit(page)
            take(app.settingsRequest)
        }
        .onChange(of: app.settingsRequest) { _, request in take(request) }
        .onChange(of: isDirty) { _, dirty in closeState.isDirty = dirty }
        .onChange(of: page) { _, newPage in history.visit(newPage) }
        .task(id: serverID) { await loadModels() }
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

    // MARK: Detail

    private var detail: some View {
        ScrollViewReader { proxy in
            pageView
                .id(page)
                .transition(.opacity)
                .animation(Motion.standard, value: page)
                .environment(\.settingsHighlight, highlight)
                .safeAreaInset(edge: .bottom) { if page.needsServer { saveBar } }
                .task(id: reveal) {
                    guard let reveal else { return }
                    // Let the page lay out before scrolling into it.
                    try? await Task.sleep(for: .milliseconds(180))
                    withAnimation(Motion.standard) { proxy.scrollTo(reveal.title, anchor: .center) }
                    highlight = reveal.title
                    try? await Task.sleep(for: .seconds(1.6))
                    if highlight == reveal.title { highlight = nil }
                }
        }
    }

    @ViewBuilder
    private var pageView: some View {
        switch page {
        case .app(let pane):
            switch pane {
            case .general: AppGeneralPane()
            case .java: JavaPane()
            case .editor: EditorSettingsPane()
            case .about: AboutPane()
            }
        case .server(let serverPage):
            if server == nil {
                noServer
            } else if let general {
                GeneralSettingsPage(page: serverPage, model: general)
            }
        case .properties(let group):
            if server == nil {
                noServer
            } else if let properties {
                PropertiesPage(group: group, model: properties, serverName: server?.name ?? "")
            }
        }
    }

    private var noServer: some View {
        ContentUnavailableView(L10n.t("native.serverSettings.noServer"), systemImage: "server.rack")
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
                if justSaved && !isDirty {
                    // Briefly confirms the save instead of a disabled button.
                    Label(L10n.t("native.properties.saved"), systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                        .transition(.opacity)
                } else {
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
            .keyboardShortcut("[", modifiers: .command)
            Button {
                if let next = history.forward() { page = next }
            } label: {
                Label(L10n.t("native.serverSettings.forward"), systemImage: "chevron.right")
            }
            .disabled(!history.canGoForward)
            .keyboardShortcut("]", modifiers: .command)
        }
    }

    // MARK: Actions

    private func take(_ request: SettingsRequest?) {
        guard let request else { return }
        app.settingsRequest = nil
        let target = request.serverID ?? app.selectedServerID ?? app.servers.first?.id
        if serverID == nil {
            serverID = target
        } else if let target, target != serverID, request.page.needsServer {
            requestServer(target)
        }
        page = request.page
        if let title = request.reveal { reveal = Reveal(title: title) }
        window?.makeKeyAndOrderFront(nil)
    }

    private func open(_ entry: SettingsSearchEntry) {
        page = entry.page
        // A page result opens the page; a row result also scrolls to the row.
        reveal = entry.section == nil ? nil : Reveal(title: entry.title)
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

    private func loadModels() async {
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
                if let search = script.search { query = search }
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
