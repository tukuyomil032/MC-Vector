use std::time::{Duration, Instant};

use app_lib::metric_history::{
    extract_tps_from_log_line, should_poll_tps, MetricHistory, METRIC_WINDOW_MS,
};

#[test]
fn retains_latest_pre_cutoff_context_and_all_points_at_or_after_cutoff() {
    let mut history = MetricHistory::new("server-a".into(), 7, Instant::now());
    history.record_resource_at(0, 12.0, 100);
    history.record_resource_at(5_000, 13.0, 150);
    history.record_resource_at(10_000, 14.0, 175);
    history.record_resource_at(50_000, 15.0, 190);

    history.record_tps_at(0, 19.0);
    history.record_tps_at(8_000, 19.5);
    history.record_tps_at(10_000, 20.0);
    history.record_tps_at(60_000, 20.5);

    let snapshot = history.record_resource_at(70_000, 18.0, 200);

    assert_eq!(70_000 - METRIC_WINDOW_MS, 10_000);
    assert_eq!(
        snapshot
            .resource
            .iter()
            .map(|point| point.elapsed_ms)
            .collect::<Vec<_>>(),
        vec![5_000, 10_000, 50_000, 70_000]
    );
    assert_eq!(
        snapshot
            .tps
            .iter()
            .map(|point| point.elapsed_ms)
            .collect::<Vec<_>>(),
        vec![8_000, 10_000, 60_000]
    );
}

#[test]
fn retains_latest_context_for_a_quiet_series_while_pruning_older_points() {
    let mut history = MetricHistory::new("server-a".into(), 7, Instant::now());
    history.record_resource_at(1_000, 12.0, 100);
    history.record_resource_at(2_000, 13.0, 150);
    history.record_tps_at(1_000, 18.0);
    history.record_tps_at(2_000, 18.5);
    let snapshot = history.record_tps_at(100_000, 19.0);

    assert_eq!(snapshot.resource.len(), 1);
    assert_eq!(snapshot.resource[0].elapsed_ms, 2_000);
    assert_eq!(
        snapshot
            .tps
            .iter()
            .map(|point| point.elapsed_ms)
            .collect::<Vec<_>>(),
        vec![2_000, 100_000]
    );
}

#[test]
fn snapshot_prunes_a_quiet_history_after_the_window_cutoff_advances() {
    let started_at = Instant::now() - Duration::from_millis(120_000);
    let mut history = MetricHistory::new("server-a".into(), 7, started_at);
    for elapsed_ms in [1_000, 20_000, 50_000] {
        history.record_resource_at(elapsed_ms, 12.0, 100);
        history.record_tps_at(elapsed_ms, 19.5);
    }

    let snapshot = history.snapshot();

    assert!(snapshot.elapsed_ms >= 120_000);
    assert_eq!(
        snapshot
            .resource
            .iter()
            .map(|point| point.elapsed_ms)
            .collect::<Vec<_>>(),
        vec![50_000]
    );
    assert_eq!(
        snapshot
            .tps
            .iter()
            .map(|point| point.elapsed_ms)
            .collect::<Vec<_>>(),
        vec![50_000]
    );
}

#[test]
fn assigns_independent_generation_and_sequence_to_each_history() {
    let mut first = MetricHistory::new("server-a".into(), 10, Instant::now());
    let mut restarted = MetricHistory::new("server-b".into(), 11, Instant::now());
    let first_snapshot = first.record_resource_at(2_000, 20.0, 1_000);
    let restarted_snapshot = restarted.record_tps_at(500, 19.0);

    assert_eq!(first_snapshot.generation, 10);
    assert_eq!(first_snapshot.sequence, 1);
    assert_eq!(first_snapshot.server_id, "server-a");
    assert_eq!(restarted_snapshot.generation, 11);
    assert_eq!(restarted_snapshot.sequence, 1);
    assert_eq!(restarted_snapshot.server_id, "server-b");
    assert!(restarted_snapshot.resource.is_empty());
    assert_eq!(restarted_snapshot.tps[0].elapsed_ms, 500);
}

#[test]
fn polls_tps_only_for_paper_and_leafmc() {
    assert!(should_poll_tps("Paper"));
    assert!(should_poll_tps("LeafMC"));
    assert!(!should_poll_tps("Vanilla"));
    assert!(!should_poll_tps("Fabric"));
}

#[test]
fn clamps_metrics_and_parses_paper_tps_logs_before_log_delivery() {
    let mut history = MetricHistory::new("paper".into(), 1, Instant::now());
    let resource = history.record_resource_at(2_000, 120.0, 700_000_000);
    let tps = history
        .record_tps_from_log("\u{1b}[32mTPS from last 1m, 5m, 15m: 19.98, 20.00, 20.00\u{1b}[0m")
        .expect("Paper TPS line should be parsed");

    assert_eq!(resource.resource[0].cpu, 100.0);
    assert_eq!(resource.resource[0].memory, 700_000_000);
    assert_eq!(tps.tps[0].tps, 19.98);
    assert_eq!(extract_tps_from_log_line("TPS: -1"), None);
    assert_eq!(extract_tps_from_log_line("TPS: 30"), Some(25.0));
    assert_eq!(extract_tps_from_log_line("TPS=19.5"), Some(19.5));
}
