import Foundation

/// Pure, stateless parser that extracts a TPS (ticks-per-second) value from
/// a single Minecraft server stdout line. Consumed by `DashboardViewModel`
/// (task 5-4), which subscribes to `ServerProcessService.stdoutLines` and
/// feeds every emitted line through `extract(from:)`. Non-`nil` results are
/// appended to a 60 s rolling window that drives the Dashboard's Swift
/// Charts TPS panel.
///
/// **Sendable value type on purpose.** No stored state — the three regex
/// literals are compiled at build time and captured in `static let`s, so
/// the struct is a zero-cost handle and safe to use from any isolation
/// domain without further ceremony.
///
/// **Regex source of truth.** The three patterns and the two-step
/// formatting-code strip mirror `extractTpsFromLogLine` in
/// `src/renderer/components/DashboardView.tsx` on the Tauri side. That
/// keeps behaviour identical across the two shells, including edge cases
/// such as Paper's `TPS from last 1m, 5m, 15m: …` prefix and the LeafMC
/// `TPS: 19.98` short form.
///
/// **Deviation from the plan text — intentional.** The task 5-3 plan
/// only mentions the ANSI escape strip and a `§[0-9a-fk-or]` Minecraft
/// color-code strip. The Tauri parser is broader: it also strips
/// (a) `§x§R§R§G§G§B§B` hex color sequences and (b) `&` legacy color
/// codes. Both appear in real Paper/LeafMC logs when a plugin or the
/// server uses `LegacyComponentSerializer`, so this port keeps the Tauri
/// behaviour verbatim rather than the narrower plan text — otherwise the
/// two shells would disagree on parity lines like `§x§F§F§F§F§F§FTPS: 20`.
public struct TPSExtractor: Sendable {
    public init() {}

    /// Extracts a TPS value from a single log line, returning `nil` when
    /// no TPS token is present. The returned value is clamped to
    /// `[0, 25]` and rounded to two decimal places, matching the Tauri
    /// `clamp(normalizeMetric(parsed, 2), 0, 25)` pipeline.
    public func extract(from line: String) -> Double? {
        let normalized = Self.stripFormattingCodes(line)

        for regex in Self.tpsRegexes {
            if let match = normalized.firstMatch(of: regex),
               let value = Double(match.output.1) {
                return Self.clampAndRound(value)
            }
        }
        return nil
    }

    // MARK: - Formatting-code stripping

    /// Strips ANSI CSI escape sequences and Minecraft color codes so the
    /// TPS regexes see raw text. Order matches the Tauri implementation:
    /// hex sequences first (they contain `§`-prefixed sub-tokens the
    /// single-char stripper would otherwise leave a stray `§x` behind),
    /// then single-char `§`/`&` codes, then ANSI.
    static func stripFormattingCodes(_ line: String) -> String {
        var stripped = line.replacing(self.hexColorRegex, with: "")
        stripped = stripped.replacing(self.singleColorRegex, with: "")
        stripped = stripped.replacing(self.ansiEscapeRegex, with: "")
        return stripped
    }

    // `Regex` is not `Sendable`, but these literals are read-only and
    // matcher state is per-call, so `nonisolated(unsafe)` is the correct
    // Swift 6 pattern for immutable global regex state.

    /// `§x(§[0-9A-Fa-f]){6}` — Paper/Spigot RGB hex format.
    private nonisolated(unsafe) static let hexColorRegex = /§x(?:§[0-9A-Fa-f]){6}/

    /// `[§&][0-9A-FK-ORX]` — legacy single-character color/formatting code.
    /// Case-insensitive so both `§a` and `§A` are stripped.
    private nonisolated(unsafe) static let singleColorRegex = /[§&][0-9A-FK-ORX]/.ignoresCase()

    /// `\u{001B}\[[0-9;]*m` — ANSI CSI SGR escape sequence (colored
    /// terminals, e.g. LeafMC's default log formatter).
    private nonisolated(unsafe) static let ansiEscapeRegex = /\u{001B}\[[0-9;]*m/

    // MARK: - TPS patterns

    /// Three patterns tried in order, matching Tauri's `extractTpsFromLogLine`.
    /// Order matters: the more specific Paper `TPS from last …` form is
    /// tried first so its number isn't misread by the generic `\bTPS\b …`
    /// fallback.
    private nonisolated(unsafe) static let tpsRegexes: [Regex<(Substring, Substring)>] = [
        tpsFromLastRegex,
        currentTpsRegex,
        genericTpsRegex
    ]

    /// `TPS(?:\s+from\s+last[\w\s,]+)?\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)`
    /// Matches Paper's `TPS from last 1m, 5m, 15m: 20.0, …` and the plain
    /// `TPS: 19.98` short form.
    private nonisolated(unsafe) static let tpsFromLastRegex =
        /TPS(?:\s+from\s+last[\w\s,]+)?\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)/.ignoresCase()

    /// `Current\s+TPS\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)`
    /// Matches variants like `Current TPS = 20.0`.
    private nonisolated(unsafe) static let currentTpsRegex =
        /Current\s+TPS\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)/.ignoresCase()

    /// `\bTPS\b[^0-9]+([0-9]+(?:\.[0-9]+)?)`
    /// Fallback for oddly-formatted lines that still put a number after
    /// the `TPS` token (e.g. `TPS (avg) - 19.6`).
    private nonisolated(unsafe) static let genericTpsRegex =
        /\bTPS\b[^0-9]+([0-9]+(?:\.[0-9]+)?)/.ignoresCase()

    // MARK: - Value shaping

    /// Clamps to `[0, 25]` (the Minecraft server tick ceiling) and rounds
    /// to two decimal places. Matches Tauri's
    /// `clamp(normalizeMetric(parsed, 2), 0, 25)`.
    static func clampAndRound(_ value: Double) -> Double {
        let clamped = min(max(value, 0), 25)
        return (clamped * 100).rounded() / 100
    }
}
