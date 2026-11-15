// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

extension DocumentContext {
    static func sourceLine(_ source: NSString, at offset: Int) -> SourceLine {
        let location = min(max(0, offset), source.length)
        var start = location
        while start > 0, source.character(at: start - 1) != 0x0A, source.character(at: start - 1) != 0x0D { start -= 1 }
        var end = location
        while end < source.length, source.character(at: end) != 0x0A, source.character(at: end) != 0x0D { end += 1 }
        return SourceLine(source: source, range: NSRange(location: start, length: end - start), number: 0)
    }

    static func previousLine(_ source: NSString, before start: Int) -> SourceLine? {
        guard start > 0 else { return nil }
        var probe = start - 1
        while probe >= 0, source.character(at: probe) == 0x0A || source.character(at: probe) == 0x0D {
            if probe == 0 { return nil }
            probe -= 1
        }
        return sourceLine(source, at: probe)
    }

    static func nextLine(_ source: NSString, after line: SourceLine) -> SourceLine? {
        var next = NSMaxRange(line.range)
        while next < source.length, source.character(at: next) == 0x0A || source.character(at: next) == 0x0D {
            next += 1
        }
        guard next < source.length else { return nil }
        return sourceLine(source, at: next)
    }

    static func forEachLine(_ source: NSString, _ body: (SourceLine) -> Void) {
        guard source.length > 0 else { return }
        var offset = 0
        var number = 0
        while offset < source.length {
            var full = source.lineRange(for: NSRange(location: offset, length: 0))
            if full.length == 0 { break }
            var end = min(NSMaxRange(full), source.length)
            while end > offset, source.character(at: end - 1) == 0x0A || source.character(at: end - 1) == 0x0D {
                end -= 1
            }
            full = NSRange(location: offset, length: end - offset)
            body(SourceLine(source: source, range: full, number: number))
            offset = NSMaxRange(source.lineRange(for: NSRange(location: offset, length: 0)))
            number += 1
        }
    }
}

struct SourceLine {
    let range: NSRange
    let number: Int
    init(source: NSString, range: NSRange, number: Int) {
        self.range = NSRange(
            location: range.location, length: max(0, min(NSMaxRange(range), source.length) - range.location))
        self.number = number
    }
}
