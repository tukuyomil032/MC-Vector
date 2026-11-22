// SPDX-License-Identifier: GPL-3.0-or-later

#if DEBUG
    import GlassKit
    import SwiftUI

    /// One sample per GlassKit part, reading and writing the Playground's state.
    struct PlaygroundSample: View {
        @Bindable var state: PlaygroundState
        @State private var isShowingNew = false

        var body: some View {
            switch state.part {
            case .morphingBar: morphingBar
            case .segmented: segmented
            case .search: search
            case .choice: choices
            case .buttons: buttons
            case .textField: textField
            case .numbers: numbers
            case .pluginsHeader: pluginsHeader
            case .icons: IconComparisonSample(state: state)
            case .iconsList: IconListSample(state: state)
            }
        }

        // MARK: Morphing bar

        private var morphingBar: some View {
            VStack(alignment: .leading, spacing: 18) {
                Picker(playgroundText("選択", "Selection"), selection: $state.selection) {
                    ForEach(PlaygroundState.Selection.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 440)
                MorphingBar(groups: barGroups)
            }
        }

        private var barGroups: [GlassBarGroup] {
            let selection = state.selection
            let selected = selection != .none
            let busy = selection == .busy
            var groups = [
                GlassBarGroup(
                    id: "nav",
                    items: [
                        .init(id: "back", title: playgroundText("戻る", "Back"), symbol: "chevron.left"),
                        .init(
                            id: "forward", title: playgroundText("進む", "Forward"), symbol: "chevron.right",
                            isEnabled: false),
                        .init(id: "up", title: playgroundText("上の階層へ", "Enclosing Folder"), symbol: "chevron.up"),
                    ]),
                GlassBarGroup(
                    id: "create",
                    items: [
                        .init(
                            id: "new", title: playgroundText("新規作成", "New"), symbol: "plus",
                            popover: GlassBarPopover(isPresented: $isShowingNew) {
                                Text(playgroundText("新しいフォルダ・新しいファイル・読み込む", "New folder, new file, import"))
                                    .padding(12)
                            })
                    ]),
            ]
            if selected {
                groups.append(
                    GlassBarGroup(
                        id: "edit",
                        items: [
                            .init(
                                id: "rename", title: playgroundText("名前を変更", "Rename"), symbol: "pencil",
                                isEnabled: (selection == .one || selection == .zip) && !busy),
                            .init(
                                id: "duplicate", title: playgroundText("複製", "Duplicate"),
                                symbol: "plus.square.on.square", isEnabled: !busy),
                            .init(
                                id: "move", title: playgroundText("移動", "Move"), symbol: "arrow.forward.folder",
                                isEnabled: !busy),
                        ]))
                var archive = [
                    GlassBarItem(
                        id: "compress", title: playgroundText("圧縮", "Compress"), symbol: "doc.zipper",
                        isEnabled: !busy)
                ]
                if selection == .zip {
                    archive.append(.init(id: "extract", title: playgroundText("解凍", "Extract"), symbol: "arrow.up.bin"))
                }
                groups.append(GlassBarGroup(id: "archive", items: archive))
                groups.append(
                    GlassBarGroup(
                        id: "trash",
                        items: [
                            .init(
                                id: "trash", title: playgroundText("ゴミ箱に入れる", "Move to Trash"), symbol: "trash",
                                isEnabled: !busy)
                        ]))
            }
            groups.append(
                GlassBarGroup(
                    id: "view",
                    items: [
                        .init(
                            id: "filter", title: playgroundText("絞り込み", "Filter"),
                            symbol: "line.3.horizontal.decrease"),
                        .init(id: "finder", title: playgroundText("Finder で開く", "Open in Finder"), symbol: "folder"),
                    ]))
            return groups
        }

        // MARK: Switches, search, choices

        private var tabs: [String] { ["browse", "installed"] }
        private var sources: [String] { ["modrinth", "hangar", "spigot"] }
        private var categories: [String] { ["all", "adventure", "economy", "management", "optimization", "worldgen"] }
        private var sorts: [String] { ["relevance", "downloads", "updated", "newest"] }

        private func tabTitle(_ tab: String) -> String {
            tab == "browse" ? playgroundText("検索", "Browse") : playgroundText("導入済み", "Installed")
        }

        private func sourceTitle(_ source: String) -> String {
            ["modrinth": "Modrinth", "hangar": "Hangar", "spigot": "SpigotMC"][source] ?? source
        }

        private func categoryTitle(_ category: String) -> String {
            switch category {
            case "all": playgroundText("すべてのカテゴリ", "All Categories")
            case "adventure": playgroundText("冒険", "Adventure")
            case "economy": playgroundText("経済", "Economy")
            case "management": playgroundText("管理", "Management")
            case "optimization": playgroundText("最適化", "Optimization")
            default: playgroundText("ワールド生成", "World Generation")
            }
        }

        private func sortTitle(_ sort: String) -> String {
            switch sort {
            case "relevance": playgroundText("関連度", "Relevance")
            case "downloads": playgroundText("ダウンロード数", "Downloads")
            case "updated": playgroundText("更新日", "Updated")
            default: playgroundText("新着", "Newest")
            }
        }

        private var segmented: some View {
            VStack(alignment: .leading, spacing: 14) {
                GlassSegmentedPicker(
                    tabs, selection: $state.tab, title: tabTitle,
                    symbol: { $0 == "browse" ? "magnifyingglass" : "checkmark.circle" })
                GlassSegmentedPicker(sources, selection: $state.source, title: sourceTitle)
            }
        }

        private var search: some View {
            GlassSearchField(
                text: $state.query,
                prompt: playgroundText("\(sourceTitle(state.source)) で検索…", "Search \(sourceTitle(state.source))…"),
                clearLabel: playgroundText("消す", "Clear")
            )
            .frame(maxWidth: 440)
        }

        private var choices: some View {
            HStack {
                GlassChoiceButton(
                    symbol: "line.3.horizontal.decrease.circle", selection: $state.category, options: categories,
                    title: categoryTitle)
                GlassChoiceButton(
                    symbol: "arrow.up.arrow.down", selection: $state.sort, options: sorts, title: sortTitle)
            }
        }

        // MARK: Buttons, text field, numbers

        private var buttons: some View {
            HStack {
                Button(playgroundText("インストール", "Install"), systemImage: "arrow.down") {}
                    .glassButtonStyle(prominent: true)
                Button(playgroundText("キャンセル", "Cancel")) {}
                    .glassButtonStyle()
                Button(playgroundText("Finder で表示", "Show in Finder"), systemImage: "folder") {}
                    .glassButtonStyle()
            }
        }

        private var textField: some View {
            HStack {
                GlassTextField(playgroundText("プレイヤー名", "Player name"), text: $state.player)
                Button(playgroundText("追加", "Add")) { state.player = "" }
                    .glassButtonStyle(prominent: true)
                    .disabled(state.player.isEmpty)
            }
            .frame(maxWidth: 440)
        }

        private var numbers: some View {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 12) {
                    Text(state.number.formatted(.number.precision(.fractionLength(0))))
                        .font(.system(size: 44, weight: .semibold, design: .rounded))
                        .rollingNumber(state.number)
                    Stepper("", value: $state.number, in: 0...10_000, step: 7).labelsHidden()
                    Button(playgroundText("ランダム", "Random")) { state.number = Double(Int.random(in: 0...9_999)) }
                        .glassButtonStyle()
                }
                RollingPercent(label: playgroundText("ダウンロード中", "Downloading"), fraction: state.progress)
                    .frame(maxWidth: 440)
                Slider(value: $state.progress, in: 0...1).frame(maxWidth: 440)
            }
        }

        // MARK: Plugins header

        private var pluginsHeader: some View {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    GlassSegmentedPicker(
                        tabs, selection: $state.tab, title: tabTitle,
                        symbol: { $0 == "browse" ? "magnifyingglass" : "checkmark.circle" })
                    Text(6_456.formatted(.number.locale(Locale(identifier: L10n.language))))
                        .foregroundStyle(.secondary)
                    Spacer()
                    GlassSegmentedPicker(sources, selection: $state.source, title: sourceTitle)
                }
                HStack {
                    search
                    GlassChoiceButton(
                        symbol: "line.3.horizontal.decrease.circle", selection: $state.category,
                        options: categories, title: categoryTitle)
                    GlassChoiceButton(
                        symbol: "arrow.up.arrow.down", selection: $state.sort, options: sorts, title: sortTitle)
                }
            }
            .frame(maxWidth: 900)
        }
    }
#endif
