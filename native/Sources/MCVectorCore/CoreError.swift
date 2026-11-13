// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation

/// Structured core failure (NAT-005 / API-003).
///
/// `code` is `<domain>.<reason>` and is meant for program logic; `message` is
/// plain English from the core and is only a fallback. The UI shows
/// `localizedDescription`, which looks up `error.<code>` and falls back to
/// `error.unknown` for codes it does not know.
public struct CoreError: Error, Equatable, Sendable {
    public let code: String
    public let message: String
    public let retryable: Bool

    public init(code: String, message: String, retryable: Bool) {
        self.code = code
        self.message = message
        self.retryable = retryable
    }

    init(_ error: FfiError) {
        switch error {
        case let .Core(code, message, retryable):
            self.init(code: code, message: message, retryable: retryable)
        }
    }

    /// Wraps an unexpected non-core error so callers only ever see CoreError.
    static func unexpected(_ error: any Error) -> CoreError {
        if let core = error as? CoreError { return core }
        if let ffi = error as? FfiError { return CoreError(ffi) }
        return CoreError(code: "internal.unknown", message: String(describing: error), retryable: false)
    }

    /// Localization key for this error, e.g. `error.lock.held_by_other`.
    public var localizationKey: String { "error.\(code)" }

    /// Localized text from `bundle`, falling back to the generic message.
    public func localizedText(bundle: Bundle = .main) -> String {
        let missing = "\u{0}missing"
        let text = bundle.localizedString(forKey: localizationKey, value: missing, table: nil)
        if text != missing { return text }
        return bundle.localizedString(forKey: "error.unknown", value: message, table: nil)
    }
}

extension CoreError: LocalizedError {
    public var errorDescription: String? { localizedText() }
}
