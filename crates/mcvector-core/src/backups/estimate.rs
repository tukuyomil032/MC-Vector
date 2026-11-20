use super::BackupRecord;

pub const ESTIMATE_SAMPLE_COUNT: usize = 5;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BackupDurationSample {
    pub size: u64,
    pub duration_ms: Option<u64>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BackupEstimate {
    pub size_bytes: u64,
    pub duration_ms: u64,
}

/// Estimates duration using the median throughput of the newest five usable
/// samples. History is expected newest first, matching the UI contract.
pub fn estimate_backup(target_bytes: u64, history: &[BackupRecord]) -> Option<BackupEstimate> {
    let samples = history.iter().map(|record| BackupDurationSample {
        size: record.total_bytes,
        duration_ms: record.duration_ms,
    });
    estimate_from_samples(target_bytes, samples)
}

pub fn estimate_backup_duration_ms(target_bytes: u64, history: &[BackupRecord]) -> Option<u64> {
    estimate_backup(target_bytes, history).map(|estimate| estimate.duration_ms)
}

pub fn estimate_from_samples(
    target_bytes: u64,
    history: impl IntoIterator<Item = BackupDurationSample>,
) -> Option<BackupEstimate> {
    let mut throughputs = Vec::with_capacity(ESTIMATE_SAMPLE_COUNT);
    for entry in history {
        if throughputs.len() >= ESTIMATE_SAMPLE_COUNT {
            break;
        }
        let (Some(duration), size) = (entry.duration_ms, entry.size) else {
            continue;
        };
        if duration == 0 || size == 0 {
            continue;
        }
        throughputs.push(size as f64 / duration as f64);
    }
    if throughputs.is_empty() {
        return None;
    }
    throughputs.sort_by(f64::total_cmp);
    let middle = throughputs.len() / 2;
    let median = if throughputs.len() % 2 == 1 {
        throughputs[middle]
    } else {
        (throughputs[middle - 1] + throughputs[middle]) / 2.0
    };
    let estimate = target_bytes as f64 / median;
    estimate.is_finite().then(|| BackupEstimate {
        size_bytes: target_bytes,
        duration_ms: estimate.round().min(u64::MAX as f64) as u64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_target_size_and_median_throughput_estimate() {
        let estimate = estimate_from_samples(
            1_000,
            [
                BackupDurationSample {
                    size: 1_000,
                    duration_ms: Some(100),
                },
                BackupDurationSample {
                    size: 3_000,
                    duration_ms: Some(100),
                },
                BackupDurationSample {
                    size: 2_000,
                    duration_ms: Some(100),
                },
            ],
        )
        .expect("valid history should produce an estimate");
        assert_eq!(estimate.size_bytes, 1_000);
        assert_eq!(estimate.duration_ms, 50);
    }

    #[test]
    fn ignores_invalid_history_and_returns_none_when_no_sample_is_usable() {
        let estimate = estimate_from_samples(
            1_000,
            [
                BackupDurationSample {
                    size: 0,
                    duration_ms: Some(1),
                },
                BackupDurationSample {
                    size: 1_000,
                    duration_ms: Some(0),
                },
                BackupDurationSample {
                    size: 1_000,
                    duration_ms: None,
                },
            ],
        );
        assert_eq!(estimate, None);
    }
}
