// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation

/// Looks up UI strings by the React translation keys (`src/i18n/locales`), compiled
/// from `native/Resources/Localizable.xcstrings` into the app's `en.lproj` / `ja.lproj`.
///
/// Placeholders keep React's `{name}` form and are substituted by name, so call
/// sites never depend on argument order:
/// `L10n.t("server.toast.available", ["version": "2.1.0"])`.
///
/// The language follows `locale` in the shared config.json (NAT-008); without it,
/// the system language. Missing keys fall back to English, then to the key itself.
enum L10n {
    /// Language codes the app ships. Order matters for the system-language fallback.
    static let supported = ["en", "ja"]

    nonisolated(unsafe) private static var activeBundle: Bundle = .main
    nonisolated(unsafe) private static var englishBundle: Bundle = .main
    nonisolated(unsafe) private(set) static var language = "en"

    /// Selects the language. Call once at startup (after the core is started) and
    /// again when the user changes the language.
    static func configure(locale: String?) {
        let preferred = locale.flatMap { supported.contains($0) ? $0 : nil }
            ?? Bundle.preferredLocalizations(from: supported).first
            ?? "en"
        language = preferred
        activeBundle = bundle(for: preferred) ?? .main
        englishBundle = bundle(for: "en") ?? .main
    }

    static func t(_ key: String, _ args: [String: any CustomStringConvertible] = [:]) -> String {
        var text = activeBundle.localizedString(forKey: key, value: missing, table: nil)
        if text == missing {
            text = englishBundle.localizedString(forKey: key, value: missing, table: nil)
        }
        if text == missing { text = key }
        for (name, value) in args {
            text = text.replacingOccurrences(of: "{\(name)}", with: value.description)
        }
        return text
    }

    private static let missing = "\u{0}missing"

    private static func bundle(for language: String) -> Bundle? {
        Bundle.main.path(forResource: language, ofType: "lproj").flatMap(Bundle.init(path:))
    }
}
