// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// The main window: a standard sidebar + detail split view.
/// The sidebar is collapsed and expanded with the system sidebar button.
struct RootView: View {
    @Environment(AppState.self) private var app
    @Environment(FeedbackCenter.self) private var feedback
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
        .onChange(of: app.isSearchFocused) { _, focus in
            if focus {
                isSearchFieldFocused = true
                app.isSearchFocused = false
            }
        }
        .feedbackHost(feedback)
        .sheet(item: $app.activeSheet) { sheet in
            ShellSheetPlaceholder(sheet: sheet)
        }
        .task {
            await app.reloadServers()
            #if DEBUG
            if let id = CaptureState.requestedID {
                await CaptureState.apply(id, app: app, feedback: feedback)
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
