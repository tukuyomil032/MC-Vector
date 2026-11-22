// SPDX-License-Identifier: GPL-3.0-or-later

#if DEBUG
    import GlassKit
    import Observation
    import SwiftUI

    /// Debug-only text in the app language; the Playground is a developer tool,
    /// so its words stay here instead of the string catalog.
    func playgroundText(_ ja: String, _ en: String) -> String {
        L10n.language == "ja" ? ja : en
    }

    extension Notification.Name {
        /// Opens the UI Playground window (capture states post it).
        static let openPlayground = Notification.Name("MCVector.openPlayground")
    }

    /// The parts listed on the left of the UI Playground.
    enum PlaygroundPart: String, CaseIterable, Identifiable {
        case morphingBar, segmented, search, choice, buttons, textField, numbers, pluginsHeader

        var id: String { rawValue }

        var title: String {
            switch self {
            case .morphingBar: playgroundText("形が変わるバー", "Morphing Bar")
            case .segmented: playgroundText("滑る切り替え", "Sliding Switch")
            case .search: playgroundText("検索欄", "Search Field")
            case .choice: playgroundText("選ぶ吹き出し", "Choice Popover")
            case .buttons: playgroundText("ボタン", "Buttons")
            case .textField: playgroundText("入力欄", "Text Field")
            case .numbers: playgroundText("数字", "Numbers")
            case .pluginsHeader: playgroundText("プラグイン画面の上", "Plugins Header")
            }
        }

        var symbol: String {
            switch self {
            case .morphingBar: "rectangle.3.group"
            case .segmented: "slider.horizontal.below.rectangle"
            case .search: "magnifyingglass"
            case .choice: "list.bullet.circle"
            case .buttons: "button.horizontal"
            case .textField: "character.cursor.ibeam"
            case .numbers: "number"
            case .pluginsHeader: "puzzlepiece.extension"
            }
        }
    }

    /// What the samples show; kept while switching parts.
    @MainActor
    @Observable
    final class PlaygroundState {
        var part: PlaygroundPart = .morphingBar
        var isDark = true
        var reducesMotion = false
        var forcesFallback = false
        var slowdown: Double = 1

        var selection: Selection = .none
        var tab = "browse"
        var source = "modrinth"
        var query = ""
        var category = "all"
        var sort = "relevance"
        var player = ""
        var number = 42.0
        var progress = 0.35

        /// What is selected in the Files sample.
        enum Selection: String, CaseIterable, Identifiable {
            case none, one, many, zip, busy
            var id: String { rawValue }

            var title: String {
                switch self {
                case .none: playgroundText("無し", "None")
                case .one: playgroundText("1つ", "One")
                case .many: playgroundText("複数", "Several")
                case .zip: playgroundText("zip だけ", "Zip only")
                case .busy: playgroundText("処理中", "Busy")
                }
            }
        }

        var appearance: GlassAppearance {
            GlassAppearance(forcesFallback: forcesFallback, slowdown: slowdown, reducesMotion: reducesMotion)
        }
    }
#endif
