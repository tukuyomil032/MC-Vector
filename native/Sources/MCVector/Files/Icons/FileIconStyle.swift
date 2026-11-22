// SPDX-License-Identifier: GPL-3.0-or-later

/// How the Files view draws icons, chosen separately for files and folders in
/// App Settings › General.
enum FileIconStyle: String, CaseIterable, Identifiable {
    /// Material Icon Theme's colored icons.
    case color
    /// One SF Symbol per kind, as before.
    case simple

    var id: Self { self }

    var titleKey: String {
        switch self {
        case .color: "native.settings.fileIcons.color"
        case .simple: "native.settings.fileIcons.simple"
        }
    }

    /// UserDefaults keys.
    static let filesKey = "files.icons.files"
    static let foldersKey = "files.icons.folders"
}
