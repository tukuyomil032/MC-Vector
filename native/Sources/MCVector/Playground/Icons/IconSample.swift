// SPDX-License-Identifier: GPL-3.0-or-later

#if DEBUG
    /// One name in the icon samples.
    struct IconSample: Identifiable {
        let name: String
        let isFolder: Bool

        var id: String { name }

        /// The SVG FileIconCatalog picks, shown beside the name.
        var iconName: String { FileIconCatalog.iconName(for: name, isDirectory: isFolder) }
    }

    /// The samples' sections, in display order.
    enum IconSampleGroup: CaseIterable, Identifiable {
        case serverFiles, languages, folders, minecraftFolders

        var id: Self { self }

        var title: String {
            switch self {
            case .serverFiles: playgroundText("サーバーのファイル", "Server Files")
            case .languages: playgroundText("プログラミング言語", "Languages")
            case .folders: playgroundText("フォルダ", "Folders")
            case .minecraftFolders: playgroundText("Minecraft のフォルダ", "Minecraft Folders")
            }
        }

        var samples: [IconSample] {
            switch self {
            case .serverFiles: Self.serverFileNames.map { IconSample(name: $0, isFolder: false) }
            case .languages: Self.languageFileNames.map { IconSample(name: $0, isFolder: false) }
            case .folders: Self.folderNames.map { IconSample(name: $0, isFolder: true) }
            case .minecraftFolders: Self.minecraftFolderNames.map { IconSample(name: $0, isFolder: true) }
            }
        }

        private static let serverFileNames = [
            "server.properties", "bukkit.yml", "config.toml", "ops.json", "eula.txt", "latest.log", "paper.jar",
            "backup.zip", "server-icon.png", "start.sh", "level.dat", "session.lock", "build.gradle", "unknown.bin",
        ]

        private static let languageFileNames = [
            "Main.java", "Plugin.kt", "script.js", "index.ts", "tool.py", "lib.rs", "main.go", "main.c", "main.cpp",
            "Program.cs", "App.swift", "app.rb", "index.php", "init.lua", "index.html", "style.css", "README.md",
            "pom.xml", "data.sql",
        ]

        private static let folderNames = [
            "folder", "plugins", "mods", "config", "logs", "libraries", "cache", "backups", "scripts", "data", "images",
            "lang", "src", "test", "docs", "dist", "downloads", "update", "keys", "java", "resources", "archive",
            "packages",
        ]

        private static let minecraftFolderNames = [
            "world", "world_nether", "world_the_end", "versions", "datapacks", "resourcepacks", "crash-reports",
            "schematics", ".paper", "bukkit",
        ]
    }
#endif
