use std::time::Instant;

use app_lib::metric_history::MetricHistory;
use app_lib::server_stdout::route_stdout_line;

#[test]
fn records_recognized_paper_tps_response_and_excludes_it_from_console() {
    let mut history = MetricHistory::new("paper".into(), 1, Instant::now());
    let line = "\u{1b}[32mTPS from last 1m, 5m, 15m: 19.98, 20.00, 20.00\u{1b}[0m";

    let routed = route_stdout_line(Some(&mut history), line.to_string());

    let snapshot = routed
        .metric_snapshot
        .expect("recognized Paper TPS response should update history");
    assert_eq!(snapshot.tps.len(), 1);
    assert_eq!(snapshot.tps[0].tps, 19.98);
    assert!(routed.console_line.is_none());
}

#[test]
fn keeps_ordinary_and_unrecognized_tps_lines_visible_in_console() {
    let mut history = MetricHistory::new("paper".into(), 1, Instant::now());
    let ordinary_line = "[Server thread/INFO]: Done (2.34s)!";
    let ordinary = route_stdout_line(Some(&mut history), ordinary_line.to_string());

    assert!(ordinary.metric_snapshot.is_none());
    assert_eq!(ordinary.console_line.as_deref(), Some(ordinary_line));

    let https_line = "[Server thread/INFO]: health check endpoint https://localhost:8080";
    let https_route = route_stdout_line(Some(&mut history), https_line.to_string());

    assert!(https_route.metric_snapshot.is_none());
    assert_eq!(https_route.console_line.as_deref(), Some(https_line));

    let failure_line = "TPS query failed: retry after 5 seconds";
    let failure_route = route_stdout_line(Some(&mut history), failure_line.to_string());

    assert!(failure_route.metric_snapshot.is_none());
    assert_eq!(failure_route.console_line.as_deref(), Some(failure_line));

    let unrecognized_tps_line = "TPS from last 1m, 5m, 15m: unavailable";
    let unrecognized = route_stdout_line(Some(&mut history), unrecognized_tps_line.to_string());

    assert!(unrecognized.metric_snapshot.is_none());
    assert_eq!(
        unrecognized.console_line.as_deref(),
        Some(unrecognized_tps_line)
    );
    assert!(history.snapshot().tps.is_empty());
}
