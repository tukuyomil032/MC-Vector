// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation
import Observation

/// Looks up UI strings by the React translation keys (`src/i18n/locales`), compiled
/// from `native/Resources/Localizable.xcstrings` into the app's `en.lproj` / `ja.lproj`.
///
/// Placeholders keep React's `{name}` form and are substituted by name, so call
/// sites never depend on argument order:
/// `L10n.t("server.toast.available", ["version": "2.1.0"])`.
///
/// The language follows `locale` in the shared config.json (NAT-008); without it,
/// the system language. Missing keys fall back to English, then to the key itself.
/// Views that call `t` re-render when the language changes, because the lookup
/// reads the observable `LanguageState`.
enum L10n {
    /// Language codes the app ships. Order matters for the system-language fallback.
    static let supported = ["en", "ja"]

    static var language: String { LanguageState.shared.language }

    /// Selects the language. Call at startup and when the user changes it.
    static func configure(locale: String?) {
        LanguageState.shared.apply(locale: locale)
    }

    static func t(_ key: String, _ args: [String: any CustomStringConvertible] = [:]) -> String {
        let state = LanguageState.shared
        var text = state.bundle.localizedString(forKey: key, value: missing, table: nil)
        if text == missing {
            text = state.englishBundle.localizedString(forKey: key, value: missing, table: nil)
        }
        if text == missing { text = key }
        for (name, value) in args {
            // A few React strings use i18next's `{{name}}` form.
            text = text.replacingOccurrences(of: "{{\(name)}}", with: value.description)
            text = text.replacingOccurrences(of: "{\(name)}", with: value.description)
        }
        return text
    }

    private static let missing = "\u{0}missing"
}

/// The active language and its bundle. Observable, so SwiftUI views refresh
/// when the user switches language in Settings.
@Observable
final class LanguageState: @unchecked Sendable {
    static let shared = LanguageState()

    private(set) var language = "en"
    private(set) var bundle: Bundle = .main
    @ObservationIgnored private(set) var englishBundle: Bundle = .main

    func apply(locale: String?) {
        let preferred = locale.flatMap { L10n.supported.contains($0) ? $0 : nil }
            ?? Bundle.preferredLocalizations(from: L10n.supported).first
            ?? "en"
        englishBundle = Self.bundle(for: "en") ?? .main
        bundle = Self.bundle(for: preferred) ?? .main
        language = preferred
    }

    private static func bundle(for language: String) -> Bundle? {
        Bundle.main.path(forResource: language, ofType: "lproj").flatMap(Bundle.init(path:))
    }
}
