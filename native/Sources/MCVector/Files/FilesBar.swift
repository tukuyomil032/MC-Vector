// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
import SwiftUI

/// The Files view's own bar: groups of glass buttons that appear and morph as
/// the selection changes. Which groups show is chosen in App › General.
struct FilesBar: View {
    @Bindable var model: FilesModel
    @AppStorage(FilesBarSettings.hiddenKey) private var hiddenGroups = ""

    var body: some View {
        MorphingBar(groups: FilesBarSettings.Group.allCases.filter { !hidden.contains($0.rawValue) }.compactMap(group))
    }

    private var hidden: Set<String> { Set(hiddenGroups.split(separator: ",").map(String.init)) }
    private var selection: Set<String> { model.selection }
    private var single: String? { selection.count == 1 ? selection.first : nil }

    private func group(_ group: FilesBarSettings.Group) -> GlassBarGroup? {
        let busy = model.isBusy
        switch group {
        case .navigation:
            return GlassBarGroup(
                id: group.rawValue,
                items: [
                    .init(
                        id: "back", title: L10n.t("native.files.back"), symbol: "chevron.left",
                        isEnabled: !model.backStack.isEmpty, action: model.goBack),
                    .init(
                        id: "forward", title: L10n.t("native.files.forward"), symbol: "chevron.right",
                        isEnabled: !model.forwardStack.isEmpty, action: model.goForward),
                    .init(
                        id: "up", title: L10n.t("files.toolbar.goUp"), symbol: "chevron.up",
                        isEnabled: !model.path.isEmpty, action: model.goUp),
                ])
        case .create:
            return GlassBarGroup(
                id: group.rawValue,
                items: [
                    .init(
                        id: "new", title: L10n.t("native.files.new"), symbol: "plus",
                        popover: GlassBarPopover(isPresented: $model.isShowingNew) {
                            FilesNewPopover(model: model) { model.isShowingNew = false }
                        })
                ])
        case .edit:
            guard !selection.isEmpty else { return nil }
            return GlassBarGroup(
                id: group.rawValue,
                items: [
                    .init(
                        id: "rename", title: L10n.t("files.contextMenu.rename"), symbol: "pencil",
                        isEnabled: single != nil && !busy
                    ) { if let single { Task { await model.rename(single) } } },
                    .init(
                        id: "duplicate", title: L10n.t("native.files.duplicate"), symbol: "plus.square.on.square",
                        isEnabled: !busy
                    ) { Task { await model.duplicate(selection) } },
                    .init(
                        id: "move", title: L10n.t("files.toolbar.move"), symbol: "arrow.forward.folder",
                        isEnabled: !busy
                    ) { model.requestMove(selection) },
                ])
        case .archive:
            guard !selection.isEmpty else { return nil }
            var items = [
                GlassBarItem(
                    id: "compress", title: L10n.t("files.toolbar.compress"), symbol: "doc.zipper", isEnabled: !busy
                ) { Task { await model.compress(selection) } }
            ]
            if selection.allSatisfy(FileKind.isZip) {
                items.append(
                    .init(
                        id: "extract", title: L10n.t("files.toolbar.extract"), symbol: "arrow.up.bin",
                        isEnabled: !busy
                    ) { Task { await model.extract(selection) } })
            }
            return GlassBarGroup(id: group.rawValue, items: items)
        case .trash:
            guard !selection.isEmpty else { return nil }
            return GlassBarGroup(
                id: group.rawValue,
                items: [
                    .init(
                        id: "trash", title: L10n.t("native.files.moveToTrash"), symbol: "trash", isEnabled: !busy
                    ) { Task { await model.trash(selection) } }
                ])
        case .view:
            return GlassBarGroup(
                id: group.rawValue,
                items: [
                    .init(
                        id: "filter", title: L10n.t("native.files.filter"),
                        symbol: "line.3.horizontal.decrease"
                    ) { model.isFiltering.toggle() },
                    .init(
                        id: "hidden", title: L10n.t("native.files.showHidden"),
                        symbol: model.showsHidden ? "eye" : "eye.slash"
                    ) { model.showsHidden.toggle() },
                    .init(id: "finder", title: L10n.t("native.files.openInFinder"), symbol: "folder") {
                        model.showInFinder()
                    },
                ])
        }
    }
}

/// Keyboard shortcuts for the Files actions, on buttons nobody sees, so they
/// work whichever groups the bar shows.
struct FilesShortcuts: View {
    let model: FilesModel

    var body: some View {
        ZStack {
            shortcut("[", .command, model.goBack)
            shortcut("]", .command, model.goForward)
            shortcut(.upArrow, .command, model.goUp)
            shortcut("d", .command) { Task { await model.duplicate(model.selection) } }
            shortcut(.delete, .command) { Task { await model.trash(model.selection) } }
            shortcut("f", .command) { model.isFiltering = true }
            shortcut("c", [.command, .option]) { model.copyPaths(model.selection) }
            shortcut(".", [.command, .shift]) { model.showsHidden.toggle() }
            shortcut("r", .command) { Task { await model.reload() } }
        }
        .frame(width: 0, height: 0)
        .opacity(0)
        .accessibilityHidden(true)
    }

    private func shortcut(_ key: KeyEquivalent, _ modifiers: EventModifiers, _ action: @escaping () -> Void)
        -> some View
    {
        Button("", action: action).keyboardShortcut(key, modifiers: modifiers)
    }
}

/// Which groups of the Files bar show (App › General).
enum FilesBarSettings {
    static let hiddenKey = "files.bar.hiddenGroups"

    enum Group: String, CaseIterable, Identifiable {
        case navigation, create, edit, archive, trash, view

        var id: String { rawValue }
        var titleKey: String { "native.settings.filesBar.\(rawValue)" }
    }
}

/// The ＋ popover: new folder, new file, import. Looks like the settings ⓘ popover.
struct FilesNewPopover: View {
    let model: FilesModel
    let close: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            row("native.files.newFolder", "folder.badge.plus") { Task { await model.create(isDirectory: true) } }
            row("native.files.newFile", "doc.badge.plus") { Task { await model.create(isDirectory: false) } }
            Divider().padding(.vertical, 4)
            row("native.files.importFiles", "square.and.arrow.down") { model.importWithPanel() }
        }
        .padding(6)
        .frame(width: 220)
    }

    private func row(_ key: String, _ symbol: String, action: @escaping () -> Void) -> some View {
        Button {
            close()
            action()
        } label: {
            Label(L10n.t(key), systemImage: symbol)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .contentShape(Rectangle())
        }
        .buttonStyle(FilesPopoverRowStyle())
    }
}

/// A plain row that highlights under the pointer, like a menu item.
private struct FilesPopoverRowStyle: ButtonStyle {
    @State private var isHovering = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(isHovering || configuration.isPressed ? Color.accentColor.opacity(0.18) : .clear)
            )
            .onHover { isHovering = $0 }
    }
}
