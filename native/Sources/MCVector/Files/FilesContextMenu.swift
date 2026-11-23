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
            if model.items.first(where: { $0.name == single })?.isDirectory == false {
                openWithMenu(single)
            }
        }
        Button(L10n.t("native.files.quickLook"), systemImage: "eye") {
            model.selection = names
            FilesQuickLook.shared.toggle(model)
        }
        if let single {
            Button(L10n.t("native.files.getInfo"), systemImage: "info.circle") {
                model.selection = [single]
                model.infoTarget = single
            }
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

    /// "Open With": the default app, the other apps by name, then Other….
    private func openWithMenu(_ name: String) -> some View {
        let apps = model.openWithApps(for: name)
        return Menu {
            ForEach(apps.filter(\.isDefault)) { app in appButton(app, name: name) }
            if apps.contains(where: \.isDefault) { Divider() }
            ForEach(apps.filter { !$0.isDefault }) { app in appButton(app, name: name) }
            if !apps.isEmpty { Divider() }
            Button(L10n.t("native.files.openWithOther")) { model.openWithOtherApp(name) }
        } label: {
            Label(L10n.t("native.files.openWith"), systemImage: "arrow.up.right.square")
        }
    }

    private func appButton(_ app: OpenWithApp, name: String) -> some View {
        Button {
            model.open(name, with: app.url)
        } label: {
            Label {
                Text(app.isDefault ? L10n.t("native.files.openWithDefault", ["app": app.name]) : app.name)
            } icon: {
                Image(nsImage: app.icon)
            }
        }
    }
}
