// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

extension CompletionEngine {
    static func boundaryIndices(in characters: [Character]) -> [Int] {
        var indices: [Int] = []
        for index in characters.indices {
            if index == 0 {
                indices.append(index)
                continue
            }
            let previous = characters[index - 1]
            let current = characters[index]
            if !previous.isLetter && !previous.isNumber {
                indices.append(index)
            } else if current.isUppercase && (previous.isLowercase || previous.isNumber) {
                indices.append(index)
            }
        }
        return indices
    }

    static func fold(_ character: Character) -> String {
        String(character).folding(
            options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
    }

    static func mergedRanges(_ indices: [Int]) -> [Range<Int>] {
        guard let first = indices.first else { return [] }
        var result: [Range<Int>] = []
        var start = first
        var end = first + 1
        for index in indices.dropFirst() {
            if index == end {
                end += 1
            } else {
                result.append(start..<end)
                start = index
                end = index + 1
            }
        }
        result.append(start..<end)
        return result
    }
}
