// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import MCVectorCore
import UniformTypeIdentifiers

/// An app that can open a file, for the "Open With" submenu.
struct OpenWithApp: Identifiable {
    let url: URL
    let name: String
    let icon: NSImage
    let isDefault: Bool

    var id: URL { url }
}

extension FilesModel {
    /// The apps macOS offers for this file: the default first, then the rest
    /// by name.
    func openWithApps(for name: String) -> [OpenWithApp] {
        guard let file = try? CoreClient.fileEntryURL(serverID: serverID, relative: relative(name)) else { return [] }
        let workspace = NSWorkspace.shared
        let defaultApp = workspace.urlForApplication(toOpen: file)
        let apps = workspace.urlsForApplications(toOpen: file).map { url in
            let icon = workspace.icon(forFile: url.path)
            icon.size = NSSize(width: 16, height: 16)
            return OpenWithApp(
                url: url,
                name: FileManager.default.displayName(atPath: url.path)
                    .replacingOccurrences(of: ".app", with: ""),
                icon: icon, isDefault: url == defaultApp)
        }
        let others = apps.filter { !$0.isDefault }.sorted {
            $0.name.localizedStandardCompare($1.name) == .orderedAscending
        }
        return apps.filter(\.isDefault).prefix(1) + others
    }

    func open(_ name: String, with app: URL) {
        guard let file = try? CoreClient.fileEntryURL(serverID: serverID, relative: relative(name)) else { return }
        let configuration = NSWorkspace.OpenConfiguration()
        NSWorkspace.shared.open([file], withApplicationAt: app, configuration: configuration) { _, error in
            guard let error else { return }
            Task { @MainActor in self.feedback?.toast(.error, error.localizedDescription) }
        }
    }

    /// "Other…": picks any app from /Applications.
    func openWithOtherApp(_ name: String) {
        let panel = NSOpenPanel()
        panel.directoryURL = URL(fileURLWithPath: "/Applications")
        panel.allowedContentTypes = [.application]
        panel.allowsMultipleSelection = false
        panel.prompt = L10n.t("native.files.open")
        guard panel.runModal() == .OK, let app = panel.url else { return }
        open(name, with: app)
    }
}
