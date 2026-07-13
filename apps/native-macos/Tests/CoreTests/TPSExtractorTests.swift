import Foundation
import Testing
@testable import Core

// Task 5-3: pure-function coverage for `TPSExtractor`. Verifies parity
// with the Tauri `extractTpsFromLogLine` implementation across the three
// regexes, the formatting-code stripper (ANSI + Minecraft `§`/`&` +
// hex `§x…`), and the `[0, 25]` clamp / two-decimal round.

// MARK: - Per-regex matching

@Test("Paper 'TPS from last 1m, 5m, 15m' line resolves to the first number")
func extractsPaperTpsFromLastLine() {
    let extractor = TPSExtractor()
    let line = "[12:34:56 INFO]: TPS from last 1m, 5m, 15m: 20.0, 20.0, 19.8"
    #expect(extractor.extract(from: line) == 20.0)
}

@Test("LeafMC minimal 'TPS: 19.98' short form resolves to 19.98")
func extractsLeafMCShortForm() {
    let extractor = TPSExtractor()
    #expect(extractor.extract(from: "TPS: 19.98") == 19.98)
}

@Test("'Current TPS = 20.0' resolves via the Current-TPS regex")
func extractsCurrentTpsEqualsForm() {
    let extractor = TPSExtractor()
    #expect(extractor.extract(from: "Current TPS = 20.0") == 20.0)
}

@Test("Generic '\\bTPS\\b …' fallback picks up loosely-formatted lines")
func extractsGenericTpsFallback() {
    // Not a `TPS:` or `Current TPS` form, but still has a TPS token
    // followed by a number, so the third regex catches it.
    let extractor = TPSExtractor()
    #expect(extractor.extract(from: "TPS (avg) - 19.6") == 19.6)
}

// MARK: - Formatting-code stripping

@Test("ANSI escape sequences are stripped before matching")
func stripsAnsiEscapeSequences() {
    let extractor = TPSExtractor()
    let line = "\u{001B}[32mTPS: 19.5\u{001B}[0m"
    #expect(extractor.extract(from: line) == 19.5)
}

@Test("Minecraft §-color codes are stripped before matching")
func stripsLegacySingleColorCodes() {
    let extractor = TPSExtractor()
    #expect(extractor.extract(from: "§aTPS: 20.0§r") == 20.0)
}

@Test("Paper §x hex color sequences are stripped before matching")
func stripsHexColorCodes() {
    let extractor = TPSExtractor()
    // §x§F§F§F§F§F§F is Paper's RGB white — must not leak digits into the match.
    let line = "§x§F§F§F§F§F§FTPS: 20.0"
    #expect(extractor.extract(from: line) == 20.0)
}

@Test("Legacy '&' color codes are stripped before matching (Tauri parity)")
func stripsAmpersandColorCodes() {
    let extractor = TPSExtractor()
    #expect(extractor.extract(from: "&aTPS: 18.75&r") == 18.75)
}

// MARK: - No-match handling

@Test("Lines without a TPS token return nil")
func returnsNilWhenNoTpsToken() {
    let extractor = TPSExtractor()
    #expect(extractor.extract(from: "[12:34:56 INFO]: Done (5.123s)! For help, type \"help\"") == nil)
}

@Test("Lines mentioning TPS but with no trailing number return nil")
func returnsNilWhenNoTrailingNumber() {
    let extractor = TPSExtractor()
    #expect(extractor.extract(from: "TPS report scheduled") == nil)
}

// MARK: - Clamping & rounding

@Test("Values above 25 are clamped down to 25")
func clampsAboveCeiling() {
    let extractor = TPSExtractor()
    #expect(extractor.extract(from: "TPS: 42.0") == 25.0)
}

@Test("Negative-looking values clamp to 0 (regex only matches positives, so exercise via clamp helper)")
func clampsBelowFloor() {
    // The regex `[0-9]+(?:\.[0-9]+)?` never captures a leading `-`, so
    // a `-3.0` input still resolves to `3.0`. Verify the clamp helper
    // directly for the below-floor branch — matches Tauri behaviour where
    // `clamp(_, 0, 25)` is the only floor guard.
    #expect(TPSExtractor.clampAndRound(-3.0) == 0.0)
}

@Test("Two-decimal rounding: 19.987 rounds up to 19.99")
func roundsUpToTwoDecimals() {
    let extractor = TPSExtractor()
    #expect(extractor.extract(from: "TPS: 19.987") == 19.99)
}

@Test("Two-decimal rounding: 19.983 rounds down to 19.98")
func roundsDownToTwoDecimals() {
    let extractor = TPSExtractor()
    #expect(extractor.extract(from: "TPS: 19.983") == 19.98)
}
