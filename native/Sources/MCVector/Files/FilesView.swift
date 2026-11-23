// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import GlassKit
import MCVectorCore
import SwiftUI

/// The Files view: a path bar (select all, the path, favorites and the
/// filter) over the current folder, or the editor when a file is open. File
/// actions live in the window toolbar (FilesToolbar) and the right-click menu;
/// the state they share is the server's FilesModel.
struct FilesView: View {
    let serverID: String
    @Environment(AppState.self) private var app
    @Environment(FeedbackCenter.self) private var feedback
    @FocusState private var filterFocused: Bool
    @AppStorage(FilesBarSettings.hiddenKey) private var hiddenBarGroupsSetting = ""

    private var model: FilesModel { app.files(for: serverID) }
    private var server: ServerProfile? { app.servers.first { $0.id == serverID } }

    var body: some View {
        @Bindable var model = model
        ZStack {
            if let openedFile = model.openedFile, openedFile.isNbt {
                NbtTreeView(serverID: serverID, file: openedFile) {
                    withAnimation(Motion.standard) { model.openedFile = nil }
                }
                .transition(.motionFade)
            } else if let openedFile = model.openedFile {
                FileEditorView(
                    serverID: serverID, file: openedFile, software: server?.software, version: server?.version
                ) {
                    withAnimation(Motion.standard) { model.openedFile = nil }
                    Task { await model.reload() }
                }
                // Fade only: moving the AppKit text view each frame makes the
                // window's constraint passes loop, like the table.
                .transition(.motionFade)
            } else {
                VStack(spacing: 0) {
                    pathBar
                    Divider()
                    layout
                }
                .transition(.motionFade)
            }
        }
        .animation(Motion.standard, value: model.openedFile)
        .task(id: model.path) { await model.reload() }
        .onChange(of: model.showsHidden) {
            model.selection = model.selection.filter { !$0.hasPrefix(".") || model.showsHidden }
        }
        .onChange(of: model.isFiltering) { _, filtering in filterFocused = filtering }
        .onAppear { model.feedback = feedback }
        .sheet(item: $model.moveRequest) { request in
            MoveDestinationSheet(serverID: serverID, serverName: server?.name ?? "", request: request) { target in
                Task { await model.move(request.entries, to: target) }
            }
        }
        #if DEBUG
            .onAppear { applyCapturePreset() }
        #endif
    }

    // MARK: Path bar

    private var pathBar: some View {
        HStack(spacing: 8) {
            Toggle(
                L10n.t("native.files.selectAll"),
                isOn: Binding(get: { model.allSelected }, set: { _ in model.toggleSelectAll() })
            )
            .toggleStyle(.checkbox)
            .labelsHidden()
            .help(L10n.t("native.files.selectAll"))
            .disabled(model.visibleRows.isEmpty)

            breadcrumb
                .popover(isPresented: folderActivityShown, arrowEdge: .bottom) {
                    if let activity = model.activity { FileActivityBubble(activity: activity) }
                }

            favoritesMenu

            Spacer(minLength: 8)

            if model.isFiltering || !model.filter.isEmpty {
                filterField
                    .transition(.motionFade)
            }

            FilesBar(model: model)

            if !hiddenBarGroups.contains(FilesBarSettings.Group.layout.rawValue) {
                layoutControls
            }
        }
        .frame(height: 40)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background { FilesShortcuts(model: model) }
        .animation(Motion.snappy, value: model.isFiltering)
    }

    // MARK: Layouts

    /// The current folder in its view, cross-fading when the view changes.
    private var layout: some View {
        ZStack {
            switch model.viewMode {
            case .icons: FilesIconGridView(model: model).transition(.motionFade)
            case .list: FilesListView(model: model).transition(.motionFade)
            case .columns: FilesColumnView(model: model).transition(.motionFade)
            case .gallery: FilesGalleryView(model: model).transition(.motionFade)
            }
        }
        .animation(Motion.standard, value: model.viewMode)
    }

    private var hiddenBarGroups: Set<String> {
        Set(hiddenBarGroupsSetting.split(separator: ",").map(String.init))
    }

    /// Grouping (not in column view) and the four views as a sliding switch.
    private var layoutControls: some View {
        @Bindable var model = model
        return HStack(spacing: 8) {
            if model.viewMode != .columns {
                GlassChoiceButton(
                    symbol: "square.grid.3x1.below.line.grid.1x2", selection: $model.grouping,
                    options: FilesGrouping.allCases, title: { L10n.t($0.titleKey) }
                )
                .fixedSize()
                .help(L10n.t("native.files.groupBy"))
                .transition(.motionFade)
            }
            GlassSegmentedPicker(
                FilesViewMode.allCases, selection: $model.viewMode, title: { L10n.t($0.titleKey) },
                symbol: \.symbol, showsTitles: false
            )
            .fixedSize()
        }
        .animation(Motion.snappy, value: model.viewMode == .columns)
    }

    private var folderActivityShown: Binding<Bool> {
        Binding(
            get: { model.activity?.anchor == .folder },
            set: { shown in
                if !shown, model.activity?.anchor == .folder, model.activity?.state == .done { model.activity = nil }
            }
        )
    }

    /// Server name first, then each folder.
    private var breadcrumb: some View {
        HStack(spacing: 2) {
            crumb(server?.name ?? L10n.t("native.files.servers"), depth: 0)
            ForEach(Array(model.path.enumerated()), id: \.offset) { index, name in
                Image(systemName: "chevron.right")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                crumb(name, depth: index + 1)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(L10n.t("files.breadcrumb.label"))
    }

    private func crumb(_ title: String, depth: Int) -> some View {
        Button(title) {
            model.navigate(to: Array(model.path.prefix(depth)))
        }
        .buttonStyle(.borderless)
        .fontWeight(depth == model.path.count ? .semibold : .regular)
        .foregroundStyle(depth == model.path.count ? .primary : .secondary)
        .lineLimit(1)
    }

    /// The star: marks this folder, and lists the marked folders to jump to.
    private var favoritesMenu: some View {
        Menu {
            Button(
                L10n.t(model.isFavorite ? "native.files.removeFavorite" : "native.files.addFavorite"),
                systemImage: model.isFavorite ? "star.slash" : "star"
            ) {
                model.toggleFavorite()
            }
            if !model.favorites.isEmpty {
                Section(L10n.t("native.files.favorites")) {
                    ForEach(model.favorites, id: \.self) { favorite in
                        Button(favorite.isEmpty ? (server?.name ?? "") : favorite, systemImage: "folder") {
                            model.openFavorite(favorite)
                        }
                    }
                }
            }
        } label: {
            Image(systemName: model.isFavorite ? "star.fill" : "star")
                .foregroundStyle(model.isFavorite ? Color.yellow : .secondary)
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .help(L10n.t("native.files.favorites"))
    }

    private var filterField: some View {
        @Bindable var model = model
        return HStack(spacing: 4) {
            Image(systemName: "line.3.horizontal.decrease.circle")
                .foregroundStyle(.secondary)
            TextField(L10n.t("native.files.filter"), text: $model.filter, prompt: Text(L10n.t("native.files.filter")))
                .textFieldStyle(.plain)
                .focused($filterFocused)
                .onExitCommand {
                    model.filter = ""
                    model.isFiltering = false
                }
            if !model.filter.isEmpty {
                Button(L10n.t("native.settings.clearSearch"), systemImage: "xmark.circle.fill") { model.filter = "" }
                    .labelStyle(.iconOnly)
                    .buttonStyle(.borderless)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .frame(width: 220)
        .glassSurface(Capsule(), interactive: true)
    }

    #if DEBUG
        /// Capture tooling: opens a folder, selects rows or opens a file.
        struct CapturePreset {
            var path: [String] = []
            var selection: Set<String> = []
            /// A file name inside `path` to open in the editor.
            var openFile: String?
            var viewMode: FilesViewMode?
            var grouping: FilesGrouping?
        }

        static var capturePreset: CapturePreset?

        private func applyCapturePreset() {
            guard let preset = Self.capturePreset else { return }
            Self.capturePreset = nil
            let model = model
            model.navigate(to: preset.path, recordHistory: false)
            // Captures share the app's defaults: show the layout without keeping it.
            let defaults = UserDefaults.standard
            let saved = defaults.dictionaryRepresentation().filter {
                $0.key.hasPrefix("files.view") || $0.key == FilesGrouping.storageKey
            }
            if let mode = preset.viewMode { model.viewMode = mode }
            if let grouping = preset.grouping { model.grouping = grouping }
            for key in defaults.dictionaryRepresentation().keys
            where key.hasPrefix("files.view") || key == FilesGrouping.storageKey {
                defaults.removeObject(forKey: key)
            }
            for (key, value) in saved { defaults.set(value, forKey: key) }
            model.pendingOpen = preset.openFile
            Task {
                try? await Task.sleep(for: .milliseconds(400))
                model.selection = preset.selection
            }
        }
    #endif
}
