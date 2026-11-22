// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation

/// Which colored icon (an SVG in Contents/Resources/MaterialIcons) a file or
/// folder gets. Material Icon Theme's names and aliases for the icons a server
/// folder needs; Minecraft's own folders use the app's mcv-* icons, drawn in
/// the same format (native/scripts/build-folder-icons.ts).
enum FileIconCatalog {
    /// The SVG's name, without the extension.
    static func iconName(for name: String, isDirectory: Bool) -> String {
        let lowered = name.lowercased()
        if isDirectory {
            return minecraftFolders[lowered] ?? folders[lowered] ?? plainFolder
        }
        if let icon = files[lowered] { return icon }
        let ext = (lowered as NSString).pathExtension
        return extensions[ext] ?? plainFile
    }

    static let plainFolder = "mcv-folder"
    static let plainFile = "mcv-file"

    /// Folders Minecraft and its servers create; Material has no icons for them.
    static let minecraftFolders: [String: String] = aliases([
        "mcv-folder-world": ["world"],
        "mcv-folder-world-nether": ["world_nether", "dim-1"],
        "mcv-folder-world-end": ["world_the_end", "dim1"],
        "mcv-folder-versions": ["versions"],
        "mcv-folder-datapacks": ["datapacks"],
        "mcv-folder-resourcepacks": ["resourcepacks", "texturepacks"],
        "mcv-folder-crash-reports": ["crash-reports"],
        "mcv-folder-schematics": ["schematics", "schematic", "structures"],
        "mcv-folder-paper": [".paper", ".paper-remapped", "paper"],
        "mcv-folder-bukkit": ["bukkit"],
    ])

    /// Material's folder icons, with the folder names Material maps to them.
    static let folders: [String: String] = aliases([
        "folder-plugin": ["plugin", "plugins", "mod", "mods", "extension", "extensions", "addon", "addons"],
        "folder-config": ["cfg", "conf", "config", "configs", "configuration", "settings"],
        "folder-log": ["log", "logs", "logging"],
        "folder-lib": ["lib", "libs", "library", "libraries", "vendor", "external"],
        "folder-temp": ["temp", "tmp", "cache", "cached", ".cache"],
        "folder-backup": ["bak", "backup", "backups", "history"],
        "folder-scripts": ["script", "scripts"],
        "folder-database": ["db", "data", "database", "databases", "storage"],
        "folder-images": ["images", "image", "img", "imgs", "icons", "icon"],
        "folder-i18n": ["i18n", "lang", "langs", "language", "languages", "locale", "locales", "l10n", "translations"],
        "folder-src": ["src", "source", "sources", "code"],
        "folder-test": ["test", "tests", "testing"],
        "folder-docs": ["doc", "docs", "documentation", "wiki"],
        "folder-dist": ["dist", "out", "output", "build", "builds", "release", "bin"],
        "folder-download": ["download", "downloads"],
        "folder-update": ["update", "updates", "upgrade", "upgrades"],
        "folder-keys": ["key", "keys", "token", "tokens", "secret", "secrets"],
        "folder-java": ["java"],
        "folder-resource": ["resource", "resources", "res", "asset", "assets", "static"],
        "folder-archive": ["archive", "archives"],
        "folder-packages": ["package", "packages", "pkg"],
    ])

    /// Whole file names that have their own icon.
    static let files: [String: String] = aliases([
        "settings": ["server.properties"],
        "lock": ["session.lock"],
        "git": [".gitignore", ".gitattributes", ".gitmodules"],
        "gradle": ["build.gradle", "settings.gradle", "build.gradle.kts", "settings.gradle.kts", "gradlew"],
        "docker": ["dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"],
        "nodejs": ["package.json", "package-lock.json"],
    ])

    /// Extensions and the Material file icon each gets.
    static let extensions: [String: String] = aliases([
        "settings": ["properties", "ini", "cfg", "conf"],
        "yaml": ["yml", "yaml"],
        "toml": ["toml"],
        "json": ["json", "json5", "jsonc"],
        "document": ["txt"],
        "log": ["log"],
        "java": ["jar", "java", "class"],
        "zip": ["zip", "gz", "tgz", "tar", "7z", "rar", "xz"],
        "image": ["png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "tiff"],
        "console": ["sh", "bash", "zsh", "command", "bat", "cmd", "ps1"],
        "minecraft": [
            "dat", "dat_old", "nbt", "mca", "mcr", "mcfunction", "mcmeta", "schem", "schematic", "litematic",
        ],
        "lock": ["lock"],
        "kotlin": ["kt", "kts"],
        "javascript": ["js", "mjs", "cjs"],
        "typescript": ["ts", "mts", "cts"],
        "python": ["py"],
        "rust": ["rs"],
        "go": ["go"],
        "c": ["c", "h"],
        "cpp": ["cpp", "cc", "cxx", "hpp", "hh"],
        "csharp": ["cs"],
        "swift": ["swift"],
        "ruby": ["rb"],
        "php": ["php"],
        "lua": ["lua"],
        "html": ["html", "htm"],
        "css": ["css"],
        "markdown": ["md", "markdown"],
        "xml": ["xml"],
        "database": ["sql", "db", "sqlite", "sqlite3"],
    ])

    /// Inverts { icon: [names] } into { name: icon }.
    private static func aliases(_ icons: [String: [String]]) -> [String: String] {
        var map: [String: String] = [:]
        for (icon, names) in icons {
            for name in names { map[name] = icon }
        }
        return map
    }
}
