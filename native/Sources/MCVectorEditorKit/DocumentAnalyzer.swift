// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

public struct HoverTarget: Sendable, Equatable {
    public var range: NSRange
    public var path: String
    public var isValue: Bool
    public var entry: SchemaEntry?

    public init(range: NSRange, path: String, isValue: Bool, entry: SchemaEntry? = nil) {
        self.range = range
        self.path = path
        self.isValue = isValue
        self.entry = entry
    }
}

public enum DocumentAnalyzer: Sendable {
    public static func hoverTarget(
        text: String,
        offset: Int,
        format: ConfigFormat,
        entries: [SchemaEntry]
    ) -> HoverTarget? {
        let source = text as NSString
        guard offset >= 0, offset < source.length,
            let context = DocumentContext.at(text: text, cursor: offset, format: format),
            !context.isBlockScalar, !context.isComment, context.range.length > 0,
            NSLocationInRange(offset, context.range)
        else { return nil }
        let path: [String]
        if context.isValue {
            path = context.path
        } else {
            let token = source.substring(with: context.range)
            let key = format == .properties ? token : DocumentContext.stripQuotes(token)
            guard !key.isEmpty else { return nil }
            path = context.path + [key]
        }
        guard !path.isEmpty else { return nil }
        return HoverTarget(
            range: context.range,
            path: path.joined(separator: "."),
            isValue: context.isValue,
            entry: DocumentContext.matchingEntry(path: path, format: format, entries: entries)
        )
    }
}
