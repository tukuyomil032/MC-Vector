use crate::metric_history::{extract_tps_from_log_line, MetricHistory, MetricHistorySnapshot};

/// The metrics and Console routing result for a line read from server stdout.
pub struct StdoutLineRoute {
    pub metric_snapshot: Option<MetricHistorySnapshot>,
    pub console_line: Option<String>,
}

/// Record recognized TPS responses when history is available and keep them out of Console.
///
/// `history` is absent when the stdout reader belongs to a stale server generation. The
/// response is still recognized and filtered, but cannot update the current generation's
/// metric history.
pub fn route_stdout_line(history: Option<&mut MetricHistory>, line: String) -> StdoutLineRoute {
    let tps = extract_tps_from_log_line(&line);
    let metric_snapshot = match (history, tps) {
        (Some(history), Some(tps)) => history.record_tps(tps),
        _ => None,
    };

    StdoutLineRoute {
        metric_snapshot,
        console_line: tps.is_none().then_some(line),
    }
}
