use std::collections::VecDeque;
use std::time::Instant;

pub const METRIC_WINDOW_MS: u64 = 60_000;

pub fn should_poll_tps(software: &str) -> bool {
    matches!(software, "Paper" | "LeafMC")
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceMetricPoint {
    pub elapsed_ms: u64,
    pub cpu: f32,
    /// Process memory in bytes, matching the existing `server-stats` event.
    pub memory: u64,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TpsMetricPoint {
    pub elapsed_ms: u64,
    pub tps: f32,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricHistorySnapshot {
    pub server_id: String,
    pub generation: u64,
    pub sequence: u64,
    pub elapsed_ms: u64,
    pub resource: Vec<ResourceMetricPoint>,
    pub tps: Vec<TpsMetricPoint>,
}

#[derive(Debug)]
pub struct MetricHistory {
    server_id: String,
    generation: u64,
    started_at: Instant,
    sequence: u64,
    resource: VecDeque<ResourceMetricPoint>,
    tps: VecDeque<TpsMetricPoint>,
}

impl MetricHistory {
    pub fn new(server_id: String, generation: u64, started_at: Instant) -> Self {
        Self {
            server_id,
            generation,
            started_at,
            sequence: 0,
            resource: VecDeque::new(),
            tps: VecDeque::new(),
        }
    }

    pub fn elapsed_ms(&self) -> u64 {
        self.started_at
            .elapsed()
            .as_millis()
            .min(u128::from(u64::MAX)) as u64
    }

    pub fn record_resource(&mut self, cpu: f32, memory: u64) -> MetricHistorySnapshot {
        self.record_resource_at(self.elapsed_ms(), cpu, memory)
    }

    pub fn record_resource_at(
        &mut self,
        elapsed_ms: u64,
        cpu: f32,
        memory: u64,
    ) -> MetricHistorySnapshot {
        self.resource.push_back(ResourceMetricPoint {
            elapsed_ms,
            cpu: if cpu.is_finite() {
                cpu.clamp(0.0, 100.0)
            } else {
                0.0
            },
            memory,
        });
        self.prune_at(elapsed_ms);
        self.advance_sequence();
        self.snapshot_at(elapsed_ms)
    }

    pub fn record_tps(&mut self, tps: f32) -> Option<MetricHistorySnapshot> {
        if !tps.is_finite() || tps < 0.0 {
            return None;
        }
        let elapsed_ms = self.elapsed_ms();
        Some(self.record_tps_at(elapsed_ms, tps))
    }

    pub fn record_tps_at(&mut self, elapsed_ms: u64, tps: f32) -> MetricHistorySnapshot {
        self.tps.push_back(TpsMetricPoint {
            elapsed_ms,
            tps: tps.clamp(0.0, 25.0),
        });
        self.prune_at(elapsed_ms);
        self.advance_sequence();
        self.snapshot_at(elapsed_ms)
    }

    pub fn record_tps_from_log(&mut self, line: &str) -> Option<MetricHistorySnapshot> {
        self.record_tps(extract_tps_from_log_line(line)?)
    }

    pub fn latest_resource(&self) -> Option<&ResourceMetricPoint> {
        self.resource.back()
    }

    pub fn snapshot(&mut self) -> MetricHistorySnapshot {
        let elapsed_ms = self.elapsed_ms();
        self.prune_at(elapsed_ms);
        self.snapshot_at(elapsed_ms)
    }

    fn snapshot_at(&self, elapsed_ms: u64) -> MetricHistorySnapshot {
        MetricHistorySnapshot {
            server_id: self.server_id.clone(),
            generation: self.generation,
            sequence: self.sequence,
            elapsed_ms,
            resource: self.resource.iter().cloned().collect(),
            tps: self.tps.iter().cloned().collect(),
        }
    }

    fn advance_sequence(&mut self) {
        self.sequence = self.sequence.saturating_add(1);
    }

    fn prune_at(&mut self, elapsed_ms: u64) {
        let cutoff = elapsed_ms.saturating_sub(METRIC_WINDOW_MS);
        while self.resource.len() > 1
            && self
                .resource
                .get(1)
                .is_some_and(|point| point.elapsed_ms < cutoff)
        {
            self.resource.pop_front();
        }
        while self.tps.len() > 1
            && self
                .tps
                .get(1)
                .is_some_and(|point| point.elapsed_ms < cutoff)
        {
            self.tps.pop_front();
        }
    }
}

pub fn extract_tps_from_log_line(line: &str) -> Option<f32> {
    let normalized = strip_log_formatting(line);
    let lowercase = normalized.to_ascii_lowercase();
    let tps_index = lowercase.match_indices("tps").find_map(|(index, _)| {
        let preceding = lowercase[..index].chars().next_back();
        let following = lowercase[index + 3..].chars().next();
        let is_token_boundary = |character: Option<char>| {
            !character.is_some_and(|character| character.is_alphanumeric() || character == '_')
        };

        (is_token_boundary(preceding) && is_token_boundary(following)).then_some(index)
    })?;
    let after_tps = normalized[tps_index + 3..].trim_start();
    let value_text = if let Some(value) = after_tps.strip_prefix(':') {
        value
    } else if let Some(value) = after_tps.strip_prefix('=') {
        value
    } else {
        const PAPER_TPS_PREFIX: &str = "from last 1m, 5m, 15m:";
        let lowercase = after_tps.to_ascii_lowercase();
        if !lowercase.starts_with(PAPER_TPS_PREFIX) {
            return None;
        }
        &after_tps[PAPER_TPS_PREFIX.len()..]
    };

    let first_value = value_text.split(',').next()?.trim();
    let value = first_value.parse::<f32>().ok()?;
    if !value.is_finite() || value < 0.0 {
        return None;
    }
    Some(value.clamp(0.0, 25.0))
}

fn strip_log_formatting(line: &str) -> String {
    let mut characters = line.chars().peekable();
    let mut result = String::with_capacity(line.len());

    while let Some(character) = characters.next() {
        if character == '\u{1b}' && characters.peek() == Some(&'[') {
            characters.next();
            for escape_character in characters.by_ref() {
                if escape_character.is_ascii_alphabetic() {
                    break;
                }
            }
            continue;
        }

        if character == '§' {
            characters.next();
            continue;
        }

        if character == '&'
            && characters.peek().is_some_and(|next| {
                next.is_ascii_hexdigit()
                    || matches!(next.to_ascii_uppercase(), 'K'..='O' | 'R' | 'X')
            })
        {
            characters.next();
            continue;
        }

        result.push(character);
    }

    result
}
