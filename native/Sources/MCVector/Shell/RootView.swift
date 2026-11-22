// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// The main window: a standard sidebar + detail split view.
/// The sidebar is collapsed and expanded with the system sidebar button.
struct RootView: View {
    @Environment(AppState.self) private var app
    @Environment(FeedbackCenter.self) private var feedback
    @Environment(ServerRuntime.self) private var runtime
    @Environment(\.openWindow) private var openWindow
    @FocusState private var isSearchFieldFocused: Bool
    /// Starts with the sidebar shown; the system sidebar button toggles it.
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

    var body: some View {
        @Bindable var app = app
        NavigationSplitView(columnVisibility: $columnVisibility) {
            SidebarView()
                .navigationSplitViewColumnWidth(min: 200, ideal: 230, max: 320)
        } detail: {
            ContentRouter()
                // Toasts sit just below the toolbar, centered on the content.
                .overlay(alignment: .top) { ToastHUD(feedback: feedback) }
                .serverToolbar()
        }
        .searchable(text: $app.searchText, placement: .toolbar, prompt: Text(L10n.t("commandPalette.placeholder")))
        .searchFocused($isSearchFieldFocused)
        .searchSuggestions { SearchSuggestions() }
        // The Settings window takes the request itself once it is open.
        .onChange(of: app.settingsRequest) { _, request in
            if request != nil { openWindow(id: SettingsWindow.windowID) }
        }
        #if DEBUG
            .onReceive(NotificationCenter.default.publisher(for: .openPlayground)) { _ in
                openWindow(id: PlaygroundWindow.windowID)
            }
        #endif
        .onChange(of: app.isSearchFocused) { _, focus in
            if focus {
                isSearchFieldFocused = true
                app.isSearchFocused = false
            }
        }
        .feedbackHost(feedback)
        .sheet(item: $app.activeSheet) { sheet in
            switch sheet {
            case .addServerChoice:
                AddServerChoiceSheet()
            case .addServer:
                #if DEBUG
                    CreateServerSheet(model: CaptureState.takeCreateServerModel() ?? CreateServerModel())
                #else
                    CreateServerSheet()
                #endif
            case .serverEula(let serverID):
                ServerEulaSheet(serverID: serverID)
            case .importServer:
                #if DEBUG
                    ImportServerSheet(model: CaptureState.takeImportServerModel() ?? ImportServerModel())
                #else
                    ImportServerSheet()
                #endif
            default:
                ShellSheetPlaceholder(sheet: sheet)
            }
        }
        .onChange(of: runtime.pendingEula) { _, pending in
            if let pending { app.activeSheet = .serverEula(serverID: pending.serverID) }
        }
        .alert(
            L10n.t("native.java.missingTitle"),
            isPresented: Binding(get: { runtime.pendingJava != nil }, set: { if !$0 { runtime.pendingJava = nil } }),
            presenting: runtime.pendingJava
        ) { pending in
            Button(L10n.t("native.java.downloadAndStart", ["major": pending.required])) {
                Task { await runtime.downloadJavaAndStart() }
            }
            .keyboardShortcut(.defaultAction)
            Button(L10n.t("native.java.startWithSystem")) {
                Task { await runtime.startWithSystemJava() }
            }
            Button(L10n.t("common.cancel"), role: .cancel) { runtime.pendingJava = nil }
        } message: { pending in
            Text(javaMissingMessage(pending))
        }
        .task {
            runtime.serverProfile = { [app] id in app.servers.first { $0.id == id } }
            await app.reloadServers()
            #if DEBUG
                if let id = CaptureState.requestedID {
                    await CaptureState.apply(
                        id, app: app, feedback: feedback, runtime: runtime
                    )
                }
            #endif
        }
    }
}

/// Sheets that later phases implement (add/import server, EULA, update, Java, upgrade wizard).
private struct ShellSheetPlaceholder: View {
    let sheet: ActiveSheet
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 16) {
            ContentUnavailableView(sheet.id, systemImage: "hammer", description: Text(L10n.t("native.notPorted")))
            HStack {
                Spacer()
                Button(L10n.t("common.close")) { dismiss() }
                    .keyboardShortcut(.cancelAction)
            }
        }
        .padding(20)
        .frame(width: 440, height: 260)
    }
}

extension RootView {
    /// "E2E Server (1.21.10) needs Java 21. The system Java is 17."
    fileprivate func javaMissingMessage(_ pending: ServerRuntime.PendingJava) -> String {
        let server = app.servers.first { $0.id == pending.serverID }
        var text = L10n.t(
            "native.java.missingMessage",
            ["name": server?.name ?? "", "version": server?.version ?? "", "major": pending.required])
        if let system = pending.systemMajor {
            text += "\n" + L10n.t("native.java.missingSystem", ["major": system])
        } else {
            text += "\n" + L10n.t("native.java.missingNoSystem")
        }
        return text
    }
}
