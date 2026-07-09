import Foundation

/// Per-user call throttling, ported from `security.rs`'s
/// `RATE_LIMITER`/`check_rate_limit`/`check_rate_limit_with_state`.
///
/// Rust protects its `HashMap<String, Instant>` with a `std::sync::Mutex`
/// behind a `OnceLock`. The `swift-concurrency` skill's guidance for
/// "shared mutable state" is to prefer an `actor` over locks/queues and
/// keep isolated sections small -- that's exactly the shape here: this
/// actor's single method body *is* the entire critical section (prune,
/// saturation check, per-user check, insert), with no `await` in the
/// middle, so there's no reentrancy window where another call could
/// observe a half-updated map. That gives the same atomicity Rust's
/// `Mutex::lock()` gives around `check_rate_limit_with_state`, without a
/// manual lock.
///
/// Rust splits a real entry point (`check_rate_limit`, which reads
/// `Instant::now()`) from a testable core (`check_rate_limit_with_state`,
/// which takes `now` as a parameter) so its unit tests can assert on
/// specific instants instead of racing the real clock. This actor mirrors
/// that split with a single method that takes `now` as a parameter
/// defaulting to the real clock: real callers get `RateLimiter.checkRateLimit(userId:)`
/// for free, and tests pass explicit `ContinuousClock.Instant` values
/// (typically offset from a shared `start` via `+ .milliseconds(...)`) to
/// deterministically land on either side of the rate-limit window. This
/// avoids `Task.sleep`-based timing tests, which is what every one of the
/// Rust rate-limit tests does with injected `Instant`s.
public actor RateLimiter {
    /// Matches Rust's `RATE_LIMIT_WINDOW`: calls from the same user inside
    /// this window are rejected.
    public static let rateLimitWindow: Duration = .seconds(1)
    /// Matches Rust's `RATE_LIMIT_MAX_ENTRIES`: once the state map holds
    /// this many distinct (non-expired) users, calls from *new* users are
    /// rejected until entries expire and get pruned.
    public static let rateLimitMaxEntries = 4096

    private var lastCallByUserId: [String: ContinuousClock.Instant] = [:]

    public init() {}

    /// Checks (and, on success, records) a call for `userId`.
    ///
    /// Mirrors Rust's `check_rate_limit_with_state` step for step:
    /// 1. Reject empty/whitespace-only user ids.
    /// 2. Prune every entry whose last call falls outside the window --
    ///    this runs on every call, exactly like Rust, so the map never
    ///    grows unbounded from one-off callers.
    /// 3. If this is a *new* user and the (now-pruned) map is already at
    ///    capacity, reject as saturated.
    /// 4. If this user already has a call inside the window, reject as
    ///    rate-limited.
    /// 5. Otherwise record `now` for this user and succeed.
    public func checkRateLimit(
        userId: String,
        now: ContinuousClock.Instant = ContinuousClock.now,
    ) throws {
        let normalizedUserId = userId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedUserId.isEmpty else {
            throw SecurityError.emptyUserId
        }

        self.lastCallByUserId = self.lastCallByUserId.filter { _, lastCall in
            now - lastCall < Self.rateLimitWindow
        }

        let isNewUser = self.lastCallByUserId[normalizedUserId] == nil
        if isNewUser, self.lastCallByUserId.count >= Self.rateLimitMaxEntries {
            throw SecurityError.rateLimiterSaturated
        }

        if let lastCall = self.lastCallByUserId[normalizedUserId], now - lastCall < Self.rateLimitWindow {
            throw SecurityError.rateLimitExceeded(userId: normalizedUserId)
        }

        self.lastCallByUserId[normalizedUserId] = now
    }

    /// Test-only introspection of which user ids are currently tracked,
    /// used to assert pruning removed stale entries without exposing the
    /// backing dictionary (or its `Instant` values) as public API.
    func trackedUserIds() -> Set<String> {
        Set(self.lastCallByUserId.keys)
    }
}
