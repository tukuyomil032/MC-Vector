// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import Observation

/// Editor preferences of the Native edition only, kept in UserDefaults
/// (config.json holds settings both editions share).
@MainActor
@Observable
final class EditorSettings {
    static let shared = EditorSettings()

    static let fontSizes: ClosedRange<Double> = 9...28
    static let defaultFontSize: Double = 13

    var themeID: String {
        didSet { defaults.set(themeID, forKey: Keys.theme) }
    }

    var fontSize: Double {
        didSet {
            let clamped = min(max(fontSize, Self.fontSizes.lowerBound), Self.fontSizes.upperBound)
            if clamped != fontSize { fontSize = clamped }
            defaults.set(fontSize, forKey: Keys.fontSize)
        }
    }

    var wrapLines: Bool {
        didSet { defaults.set(wrapLines, forKey: Keys.wrap) }
    }

    var showInvisibles: Bool {
        didSet { defaults.set(showInvisibles, forKey: Keys.invisibles) }
    }

    /// Completion list while typing; ⌃Space works either way.
    var suggestWhileTyping: Bool {
        didSet { defaults.set(suggestWhileTyping, forKey: Keys.suggest) }
    }

    /// Dimmed inline suggestion after the cursor, accepted with Tab.
    var inlineSuggestions: Bool {
        didSet { defaults.set(inlineSuggestions, forKey: Keys.inline) }
    }

    @ObservationIgnored private let defaults: UserDefaults

    private enum Keys {
        static let theme = "editor.theme"
        static let fontSize = "editor.fontSize"
        static let wrap = "editor.wrapLines"
        static let invisibles = "editor.showInvisibles"
        static let suggest = "editor.suggestWhileTyping"
        static let inline = "editor.inlineSuggestions"
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        themeID = defaults.string(forKey: Keys.theme) ?? EditorThemes.defaultID
        let size = defaults.double(forKey: Keys.fontSize)
        fontSize = size == 0 ? Self.defaultFontSize : size
        wrapLines = defaults.bool(forKey: Keys.wrap)
        showInvisibles = defaults.bool(forKey: Keys.invisibles)
        suggestWhileTyping = defaults.object(forKey: Keys.suggest) as? Bool ?? true
        inlineSuggestions = defaults.object(forKey: Keys.inline) as? Bool ?? true
    }

    var theme: EditorTheme? { EditorThemes.theme(id: themeID) }

    var font: NSFont { .monospacedSystemFont(ofSize: fontSize, weight: .regular) }

    func zoom(by step: Double) { fontSize += step }
    func resetZoom() { fontSize = Self.defaultFontSize }
}
