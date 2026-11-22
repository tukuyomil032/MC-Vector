// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// The right-click menu: every toolbar action, each with its symbol. On the
/// empty area it offers what applies to the folder itself.
struct FilesContextMenu: View {
    let model: FilesModel
    let names: Set<String>

    var body: some View {
        if names.isEmpty {
            folderMenu
        } else {
            entryMenu
        }
    }

    @ViewBuilder
    private var folderMenu: some View {
        Button(L10n.t("native.files.newFolder"), systemImage: "folder.badge.plus") {
            Task { await model.create(isDirectory: true) }
        }
        Button(L10n.t("native.files.newFile"), systemImage: "doc.badge.plus") {
            Task { await model.create(isDirectory: false) }
        }
        Button(L10n.t("native.files.importFiles"), systemImage: "square.and.arrow.down") {
            model.importWithPanel()
        }
        Divider()
        Button(L10n.t("files.contextMenu.move"), systemImage: "arrow.forward.folder") {
            model.requestMoveCurrentFolder()
        }
        .disabled(model.path.isEmpty)
        Button(
            L10n.t(model.isFavorite ? "native.files.removeFavorite" : "native.files.addFavorite"),
            systemImage: model.isFavorite ? "star.slash" : "star"
        ) {
            model.toggleFavorite()
        }
        Divider()
        Button(L10n.t("native.files.openInFinder"), systemImage: "folder") { model.showInFinder() }
        Button(L10n.t("native.files.copyPath"), systemImage: "doc.on.clipboard") { model.copyPaths([]) }
        Divider()
        Toggle(isOn: Bindable(model).showsHidden) {
            Label(L10n.t("native.files.showHidden"), systemImage: "eye")
        }
        Button(L10n.t("native.files.refresh"), systemImage: "arrow.clockwise") {
            Task { await model.reload() }
        }
    }

    @ViewBuilder
    private var entryMenu: some View {
        let single = names.count == 1 ? names.first : nil
        if let single {
            Button(L10n.t("native.files.open"), systemImage: "arrow.up.forward.app") { model.open(single) }
            Divider()
            Button(L10n.t("files.contextMenu.rename"), systemImage: "pencil") {
                Task { await model.rename(single) }
            }
        }
        Button(L10n.t("native.files.duplicate"), systemImage: "plus.square.on.square") {
            Task { await model.duplicate(names) }
        }
        .disabled(model.isBusy)
        Button(L10n.t("files.contextMenu.moveItem"), systemImage: "arrow.forward.folder") {
            model.requestMove(names)
        }
        Button(L10n.t("files.contextMenu.compressItem"), systemImage: "doc.zipper") {
            Task { await model.compress(names) }
        }
        .disabled(model.isBusy)
        if names.allSatisfy(FileKind.isZip) {
            Button(L10n.t("files.contextMenu.extractItem"), systemImage: "arrow.up.bin") {
                Task { await model.extract(names) }
            }
            .disabled(model.isBusy)
        }
        Divider()
        Button(L10n.t("native.files.revealInFinder"), systemImage: "folder") {
            model.showInFinder(single ?? names.sorted()[0])
        }
        Button(L10n.t("native.files.copyPath"), systemImage: "doc.on.clipboard") { model.copyPaths(names) }
        if let single, model.items.first(where: { $0.name == single })?.isDirectory == true {
            let relative = model.relative(single)
            Button(
                L10n.t(model.favorites.contains(relative) ? "native.files.removeFavorite" : "native.files.addFavorite"),
                systemImage: model.favorites.contains(relative) ? "star.slash" : "star"
            ) {
                model.toggleFavorite(relative)
            }
        }
        Divider()
        Button(L10n.t("native.files.moveToTrash"), systemImage: "trash", role: .destructive) {
            Task { await model.trash(names) }
        }
    }
}
