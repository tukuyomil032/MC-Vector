// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

struct EditorCursorContext: Sendable {
    let path: [String]
    let range: NSRange
    let isValue: Bool
    let prefix: String
    let rawValue: String?
    let siblings: Set<String>
    let isHeader: Bool
    let isBlockScalar: Bool
    let line: Int
    var isComment = false
}

struct EditorOccurrence: Sendable {
    let path: [String]
    let keyRange: NSRange
    let valueRange: NSRange
    let rawValue: String
    let line: Int
    var isDuplicate = false
}

enum DocumentContext {}
