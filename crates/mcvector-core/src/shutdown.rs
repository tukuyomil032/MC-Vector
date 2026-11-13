//! Shared shutdown timing constants (DATA-009).
//!
//! The Tauri and native SwiftUI editions both stop Minecraft servers with
//! these values, so a server shuts down the same way regardless of which
//! edition launched it.

use std::time::Duration;

/// How long a Minecraft server gets after the `stop` command before it is
/// force-killed.
pub const SERVER_STOP_GRACE_PERIOD: Duration = Duration::from_secs(20);

/// How long to wait for a force-killed server process to be collected (reaped)
/// by the OS.
pub const PROCESS_KILL_REAP_TIMEOUT: Duration = Duration::from_secs(5);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shutdown_timing_values_are_fixed() {
        assert_eq!(SERVER_STOP_GRACE_PERIOD, Duration::from_secs(20));
        assert_eq!(PROCESS_KILL_REAP_TIMEOUT, Duration::from_secs(5));
    }
}
