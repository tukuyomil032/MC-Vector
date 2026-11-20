// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import MCVectorCore
import SwiftUI

/// Plugins / Mods (UI-010, React PluginBrowser): Browse searches the sources
/// the server type supports in a card grid with details in the inspector;
/// Installed manages the files in plugins/ or mods/, with search, updates,
/// Update All and Show in Finder.
struct PluginsView: View {
    @Environment(FeedbackCenter.self) private var feedback
    @AppStorage(PluginsPaging.storageKey) private var paging: PluginsPaging = .infinite
    @State private var model: PluginsModel
    @State private var pendingUninstall: InstalledItem?
    @State private var pageField = ""

    #if DEBUG
        /// Capture states: open a tab or select the first result once loaded.
        struct CapturePreset {
            var tab: PluginsTab = .browse
            var selectFirst = false
            /// Installs the first result for real (confirming the preview) and
            /// then shows Installed.
            var installFirst = false
        }

        static var capturePreset: CapturePreset?
    #endif

    init(server: ServerProfile) {
        _model = State(initialValue: PluginsModel(server: server))
    }

    var body: some View {
        @Bindable var model = model
        VStack(spacing: 0) {
            header
            if let bulk = model.bulk {
                BulkBar(progress: bulk) { Task { await model.cancelUpdateAll() } }
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
            Divider()
            Group {
                switch model.tab {
                case .browse: browse
                case .installed: installedList
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .transition(.opacity)
        }
        .animation(Motion.standard, value: model.tab)
        .animation(Motion.standard, value: model.bulk != nil)
        .inspector(isPresented: inspectorShown) {
            Group {
                if let item = model.selected {
                    PluginInspector(model: model, item: item) { Task { await install(item) } }
                        .id(item.id)
                }
            }
            .inspectorColumnWidth(min: 300, ideal: 360, max: 520)
        }
        .task { await loadInitial() }
        .sheet(item: $model.pendingInstall) { pending in
            PluginInstallSheet(model: model, pending: pending)
        }
        .alert(item: $model.blocked) { blocked in
            if let url = blocked.externalURL {
                Alert(
                    title: Text(blocked.title), message: Text(blocked.message),
                    primaryButton: .default(Text(L10n.t("plugins.browser.open"))) { NSWorkspace.shared.open(url) },
                    secondaryButton: .cancel(Text(L10n.t("common.cancel"))))
            } else {
                Alert(title: Text(blocked.title), message: Text(blocked.message))
            }
        }
        .confirmationDialog(
            L10n.t("plugins.browser.uninstallTitle"),
            isPresented: Binding(get: { pendingUninstall != nil }, set: { if !$0 { pendingUninstall = nil } }),
            presenting: pendingUninstall
        ) { item in
            Button(L10n.t("plugins.browser.uninstall"), role: .destructive) {
                Task { await model.uninstall(item, feedback: feedback) }
            }
            Button(L10n.t("common.cancel"), role: .cancel) {}
        } message: { item in
            Text(L10n.t("plugins.browser.confirmUninstall", ["name": item.title]))
        }
        // Formatted numbers (compact downloads, counts, dates) in the view, inspector and sheets follow the app language.
        .environment(\.locale, Locale(identifier: L10n.language))
    }

    private var inspectorShown: Binding<Bool> {
        Binding(
            get: { model.tab == .browse && model.selection != nil },
            set: { if !$0 { model.selection = nil } })
    }

    private func loadInitial() async {
        model.search()
        await withDiscardingTaskGroup { group in
            group.addTask { await model.loadCategories() }
            group.addTask { await model.reloadInstalled(checkUpdates: true) }
        }
        #if DEBUG
            if let preset = Self.capturePreset {
                model.tab = preset.tab
                if preset.selectFirst {
                    for _ in 0..<100 where model.results.isEmpty {
                        try? await Task.sleep(for: .milliseconds(100))
                    }
                    model.selection = model.results.first?.id
                }
                if preset.installFirst {
                    for _ in 0..<100 where model.results.isEmpty {
                        try? await Task.sleep(for: .milliseconds(100))
                    }
                    if let first = model.results.first {
                        await model.install(first, feedback: feedback)
                        if let pending = model.pendingInstall {
                            model.pendingInstall = nil
                            await model.execute(pending, feedback: feedback)
                        } else {
                            CaptureState.note("[capture] install did not reach a confirmation")
                        }
                    }
                    model.tab = .installed
                    CaptureState.note("[capture] installed: \(model.installed.map(\.plugin.fileName))")
                }
            }
        #endif
    }

    private func install(_ item: PluginItem) async {
        if let installed = model.installedFile(for: item), installed.updateVersion != nil {
            await model.update(installed, feedback: feedback)
        } else {
            await model.install(item, feedback: feedback)
        }
    }

    // MARK: Header

    private var header: some View {
        @Bindable var model = model
        return VStack(spacing: 10) {
            // The result count goes first when the inspector narrows the row.
            ViewThatFits(in: .horizontal) {
                topRow(showsCount: true)
                topRow(showsCount: false)
            }
            HStack(spacing: 12) {
                switch model.tab {
                case .browse: browseControls
                case .installed: installedControls
                }
            }
        }
        .controlSize(.large)
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private func topRow(showsCount: Bool) -> some View {
        @Bindable var model = model
        return HStack(spacing: 12) {
            Picker(L10n.t("plugins.browser.viewSwitch"), selection: $model.tab) {
                Text(L10n.t("plugins.browser.tabBrowse")).tag(PluginsTab.browse)
                Text(L10n.t("plugins.browser.tabInstalled", ["count": model.installed.count]))
                    .tag(PluginsTab.installed)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .fixedSize()
            if showsCount { resultCount.fixedSize() }
            Spacer(minLength: 0)
            if model.tab == .browse, model.support.sources.count > 1 {
                Picker(
                    L10n.t("plugins.browser.platformLabel"),
                    selection: Binding(get: { model.source }, set: { model.changeSource($0) })
                ) {
                    ForEach(model.support.sources, id: \.self) { source in
                        Text(L10n.t(source.titleKey)).tag(source)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .fixedSize()
                .transition(.opacity)
            }
        }
    }

    private func searchField(_ prompt: String, text: Binding<String>, onSubmit: @escaping () -> Void = {})
        -> some View
    {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField(prompt, text: text).textFieldStyle(.plain).onSubmit(onSubmit)
            if !text.wrappedValue.isEmpty {
                Button {
                    text.wrappedValue = ""
                    onSubmit()
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.tertiary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .frame(minWidth: 180, maxWidth: 360)
    }

    @ViewBuilder private var browseControls: some View {
        @Bindable var model = model
        searchField(
            L10n.t("plugins.browser.searchOn", ["platform": L10n.t(model.source.titleKey)]),
            text: $model.query
        ) { model.search() }
        .onChange(of: model.query) { model.search(debounce: true) }

        Menu {
            Picker(L10n.t("native.plugins.category"), selection: categoryBinding) {
                Text(L10n.t("native.plugins.allCategories")).tag(String?.none)
                if !model.categories.isEmpty { Divider() }
                ForEach(model.categories, id: \.id) { category in
                    Text(category.name).tag(String?.some(category.id))
                }
            }
            .pickerStyle(.inline)
        } label: {
            Label(categoryTitle, systemImage: "line.3.horizontal.decrease.circle")
        }
        .fixedSize()

        Menu {
            Picker(L10n.t("plugins.browser.sortLabel"), selection: sortBinding) {
                ForEach(PluginSort.allCases, id: \.self) { sort in
                    Text(L10n.t(sort.titleKey)).tag(sort)
                }
            }
            .pickerStyle(.inline)
        } label: {
            Label(L10n.t(model.sort.titleKey), systemImage: "arrow.up.arrow.down")
        }
        .fixedSize()
        .help(L10n.t("plugins.browser.sortHint"))

        Spacer(minLength: 0)
    }

    @ViewBuilder private var resultCount: some View {
        if model.tab == .browse, let total = model.total, model.load == .loaded {
            Text(L10n.t("native.plugins.results", ["count": total.formatted()]))
                .foregroundStyle(.secondary)
                .monospacedDigit()
                .contentTransition(.numericText(value: Double(total)))
                .animation(Motion.value, value: total)
                .lineLimit(1)
        }
    }

    private var categoryBinding: Binding<String?> {
        Binding(
            get: { model.category },
            set: {
                model.category = $0
                model.search()
            })
    }

    private var sortBinding: Binding<PluginSort> {
        Binding(
            get: { model.sort },
            set: {
                model.sort = $0
                model.search()
            })
    }

    private var categoryTitle: String {
        model.categories.first { $0.id == model.category }?.name ?? L10n.t("native.plugins.allCategories")
    }

    @ViewBuilder private var installedControls: some View {
        @Bindable var model = model
        searchField(L10n.t("native.plugins.searchInstalled"), text: $model.installedSearch)
        Spacer()
        if model.checkingUpdates {
            ProgressView().controlSize(.small)
            Text(L10n.t("plugins.browser.updateChecking")).foregroundStyle(.secondary)
        }
        Button(L10n.t("native.plugins.refresh"), systemImage: "arrow.clockwise") {
            Task { await model.reloadInstalled(checkUpdates: true) }
        }
        .labelStyle(.iconOnly)
        .disabled(model.checkingUpdates || model.bulk != nil)
        Button {
            Task { await model.updateAll(feedback: feedback) }
        } label: {
            Label(
                L10n.t("native.plugins.updateAll", ["count": model.updatable.count]),
                systemImage: "arrow.triangle.2.circlepath")
        }
        .buttonStyle(.borderedProminent)
        .disabled(model.updatable.isEmpty || model.bulk != nil)
    }

    // MARK: Browse

    @ViewBuilder private var browse: some View {
        switch model.load {
        case .idle, .loading:
            ScrollView { grid(placeholders: true) }.transition(.motionFade)
        case .failed(let error):
            ContentUnavailableView {
                Label(L10n.t("plugins.browser.searchError"), systemImage: "wifi.exclamationmark")
            } description: {
                Text(error.uiText)
            } actions: {
                Button(L10n.t("plugins.browser.retry")) { model.search() }
            }
            .transition(.motionFade)
        case .loaded where model.results.isEmpty:
            ContentUnavailableView(
                L10n.t("plugins.browser.noResults"), systemImage: "magnifyingglass",
                description: Text(L10n.t("plugins.browser.noResultsHint"))
            )
            .transition(.motionFade)
        case .loaded:
            ScrollView {
                grid(placeholders: false)
                footer
            }
            .transition(.motionFade)
        }
    }

    private func grid(placeholders: Bool) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 260, maximum: 420), spacing: 14)], spacing: 14) {
            if placeholders {
                ForEach(0..<9, id: \.self) { _ in PlaceholderCard() }
            } else {
                ForEach(model.results) { item in
                    PluginCard(
                        item: item, isSelected: model.selection == item.id,
                        progress: model.installing[item.id], installed: model.installedFile(for: item)
                    ) {
                        Task { await install(item) }
                    }
                    .onTapGesture {
                        withAnimation(Motion.standard) {
                            model.selection = model.selection == item.id ? nil : item.id
                        }
                    }
                    .onAppear {
                        if paging == .infinite, item.id == model.results.last?.id {
                            Task { await model.loadMore() }
                        }
                    }
                    .transition(.scale(scale: 0.96).combined(with: .opacity))
                }
            }
        }
        .padding(20)
    }

    @ViewBuilder private var footer: some View {
        switch paging {
        case .infinite:
            if model.isLoadingMore {
                ProgressView().padding(.bottom, 20)
            }
        case .pages:
            Pager(
                page: model.page, pageCount: model.pageCount, hasNext: !model.reachedEnd,
                field: $pageField
            ) { model.goTo(page: $0) }
            .padding(.bottom, 20)
        }
    }

}

// Installed tab, kept apart so the type body stays within the lint limit.
extension PluginsView {
    // MARK: Installed

    @ViewBuilder private var installedList: some View {
        switch model.installedLoad {
        case .idle, .loading:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let error):
            ContentUnavailableView {
                Label(L10n.t("plugins.installed.title"), systemImage: "exclamationmark.triangle")
            } description: {
                Text(error.uiText)
            } actions: {
                Button(L10n.t("plugins.browser.retry")) { Task { await model.reloadInstalled(checkUpdates: true) } }
            }
        case .loaded where model.installed.isEmpty:
            ContentUnavailableView(
                L10n.t("plugins.installed.empty"), systemImage: "shippingbox",
                description: Text(
                    L10n.t("plugins.browser.installedEmptyHint", ["folder": model.support.targetDirectory])))
        case .loaded where model.visibleInstalled.isEmpty:
            ContentUnavailableView.search(text: model.installedSearch)
        case .loaded:
            List(model.visibleInstalled) { item in
                InstalledRow(
                    item: item, progress: model.updating[item.id], isBusy: model.bulk != nil,
                    toggle: { Task { await model.toggle(item, feedback: feedback) } },
                    update: { Task { await model.update(item, feedback: feedback) } }
                )
                .contextMenu { installedMenu(item) }
            }
            .listStyle(.inset)
            .animation(Motion.standard, value: model.visibleInstalled)
        }
    }

    @ViewBuilder private func installedMenu(_ item: InstalledItem) -> some View {
        if item.updateVersion != nil {
            Button(L10n.t("plugins.browser.update"), systemImage: "arrow.triangle.2.circlepath") {
                Task { await model.update(item, feedback: feedback) }
            }
        }
        Button(
            L10n.t(item.plugin.enabled ? "plugins.browser.disable" : "plugins.browser.enable"),
            systemImage: item.plugin.enabled ? "pause.circle" : "play.circle"
        ) {
            Task { await model.toggle(item, feedback: feedback) }
        }
        Button(L10n.t("native.serverSettings.showInFinder"), systemImage: "folder") {
            NSWorkspace.shared.activateFileViewerSelecting([model.fileURL(item)])
        }
        Divider()
        Button(L10n.t("plugins.browser.uninstall"), systemImage: "trash", role: .destructive) {
            pendingUninstall = item
        }
    }
}

/// A grey card while the first page loads.
private struct PlaceholderCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 10).frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 6) {
                    Capsule().frame(width: 120, height: 10)
                    Capsule().frame(width: 70, height: 8)
                }
            }
            Capsule().frame(height: 8)
            Capsule().frame(width: 160, height: 8)
        }
        .foregroundStyle(.quaternary)
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .phaseAnimator([0.55, 1]) { content, phase in
            content.opacity(phase)
        } animation: { _ in
            .easeInOut(duration: 0.9)
        }
    }
}

/// Previous / next, the page number and a jump field (page mode).
private struct Pager: View {
    let page: Int
    let pageCount: Int?
    let hasNext: Bool
    @Binding var field: String
    let go: (Int) -> Void

    var body: some View {
        HStack(spacing: 10) {
            Button(L10n.t("plugins.browser.prev"), systemImage: "chevron.left") { go(page - 1) }
                .disabled(page == 0)
            Text(pageLabel).monospacedDigit().contentTransition(.numericText(value: Double(page)))
            Button(L10n.t("plugins.browser.next"), systemImage: "chevron.right") { go(page + 1) }
                .disabled(!hasNext)
            Divider().frame(height: 16)
            TextField(L10n.t("plugins.browser.pageNumberAriaLabel"), text: $field)
                .frame(width: 60)
                .onSubmit(jump)
            Button(L10n.t("plugins.browser.go"), action: jump)
        }
        .labelStyle(.iconOnly)
        .animation(Motion.value, value: page)
    }

    private var pageLabel: String {
        if let pageCount { return "\(page + 1) / \(pageCount)" }
        return L10n.t("plugins.browser.pageLabel", ["current": page + 1])
    }

    private func jump() {
        guard let number = Int(field.trimmingCharacters(in: .whitespaces)), number >= 1 else { return }
        go(min(number, pageCount ?? number) - 1)
        field = ""
    }
}

/// "Updating 2 of 5 — file.jar" with a bar and Cancel, during Update All.
private struct BulkBar: View {
    let progress: PluginBulkProgress
    let cancel: () -> Void

    var body: some View {
        let fraction = progress.total == 0 ? 0 : Double(progress.completed) / Double(progress.total)
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(
                    L10n.t(
                        "native.plugins.updatingAll",
                        ["completed": progress.completed, "total": progress.total])
                )
                .monospacedDigit()
                .contentTransition(.numericText(value: Double(progress.completed)))
                if !progress.currentFile.isEmpty {
                    Text(progress.currentFile).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
                Button(L10n.t("common.cancel"), action: cancel).controlSize(.small)
            }
            .font(.callout)
            ProgressView(value: fraction)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 10)
    }
}
