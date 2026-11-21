//! Shared automatic backup scheduling and runtime orchestration.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use chrono::{Datelike, Local, LocalResult, NaiveTime, TimeZone, Timelike};
use serde_json::Number;
use tokio::sync::Mutex;

use crate::error::CoreError;
use crate::managed_path::{resolve_managed_request, ManagedPathRequest, ManagedRoot};
use crate::operations::{OperationKind, ServerOperationManager};
use crate::registry::{MinecraftServer, ServerRegistry};
use crate::server_process::{
    self, CommandLimiter, ServerContext, ServerManager, StopErrorRecoveryState,
};

use super::catalog::{apply_retention_at, BackupRetentionReport};
use super::create::{create_backup, CreateBackupRequest};
use super::BackupOrigin;

const MAX_BACKUP_INTERVAL_MINUTES: u64 = 1_440;
const BACKUP_RETRY_DELAY_MS: i64 = 60_000;

/// One progress update tagged with the cancellable run ID used by the FFI.
#[derive(Clone, Debug, PartialEq)]
pub struct AutoBackupProgressEvent {
    pub operation_id: String,
    pub server_id: String,
    pub fraction: f32,
    pub current_file: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AutoBackupTickStatus {
    Created,
    Skipped,
    Failed,
}

/// Terminal result for one server selected by the scheduler.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AutoBackupTickResult {
    pub operation_id: String,
    pub server_id: String,
    pub server_name: String,
    pub status: AutoBackupTickStatus,
    pub backup_name: Option<String>,
    pub catalog_error: Option<String>,
    pub retention: Option<BackupRetentionReport>,
    pub retention_error: Option<String>,
    pub error: Option<String>,
    pub restart_error: Option<String>,
}

/// Deterministic schedule query result for one server profile.
///
/// `next_due_at_ms` is `None` when automatic backups are disabled. When
/// `due` is true, it contains the scheduled timestamp that became due and can
/// be at or before the supplied `now_ms`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AutoBackupDue {
    pub due: bool,
    pub next_due_at_ms: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct BackupSchedule {
    signature: String,
    next_run_at_ms: i64,
}

#[derive(Clone, Debug)]
struct ActiveBackup {
    operation_id: String,
    cancellation: Arc<AtomicBool>,
}

#[derive(Default)]
struct AutoBackupState {
    schedules: HashMap<String, BackupSchedule>,
    active_backups: HashMap<String, ActiveBackup>,
}

/// In-memory scheduler shared by Tauri and Native adapters. The adapters own
/// the timer and supply the same process, registry and operation services.
/// Schedule state resets when the process starts; callers that need a
/// last-backup-aware schedule query can use [`compute_next_due`].
#[derive(Clone, Default)]
pub struct AutoBackupManager {
    state: Arc<Mutex<AutoBackupState>>,
    tick_gate: Arc<Mutex<()>>,
    shutting_down: Arc<AtomicBool>,
}

impl AutoBackupManager {
    /// Cancels a currently running automatic backup by its operation ID.
    pub async fn cancel(&self, operation_id: &str) -> bool {
        let state = self.state.lock().await;
        let Some(active) = state
            .active_backups
            .values()
            .find(|active| active.operation_id == operation_id)
        else {
            return false;
        };
        active.cancellation.store(true, Ordering::SeqCst);
        true
    }

    /// Cancels active automatic backups and waits for the in-flight tick to
    /// release its operation guards before the host shuts down.
    pub async fn shutdown(&self) {
        self.shutting_down.store(true, Ordering::SeqCst);
        {
            let state = self.state.lock().await;
            for active in state.active_backups.values() {
                active.cancellation.store(true, Ordering::SeqCst);
            }
        }
        drop(self.tick_gate.lock().await);
    }

    /// Reconciles saved settings, then runs every due backup. A fixed clock is
    /// accepted so schedule decisions can be tested without sleeping.
    pub async fn tick<F>(
        &self,
        context: ServerContext,
        servers: &ServerManager,
        limiter: &CommandLimiter,
        registry: &ServerRegistry,
        operations: &ServerOperationManager,
        now_ms: i64,
        progress: Arc<F>,
    ) -> Result<Vec<AutoBackupTickResult>, CoreError>
    where
        F: Fn(AutoBackupProgressEvent) + Send + Sync + 'static + ?Sized,
    {
        if self.shutting_down.load(Ordering::SeqCst) {
            return Ok(Vec::new());
        }
        let _tick = self.tick_gate.lock().await;
        if self.shutting_down.load(Ordering::SeqCst) {
            return Ok(Vec::new());
        }
        let registry_for_read = registry.clone();
        let profiles = tokio::task::spawn_blocking(move || registry_for_read.get_servers())
            .await
            .map_err(|error| CoreError::internal(format!("Server registry task failed: {error}")))?
            .map_err(CoreError::internal)?;

        let jobs = {
            let mut state = self.state.lock().await;
            if self.shutting_down.load(Ordering::SeqCst) {
                return Ok(Vec::new());
            }
            reconcile_schedules(&mut state, &profiles, now_ms);
            let active_ids = state.active_backups.keys().cloned().collect::<HashSet<_>>();
            let due_profiles = state
                .schedules
                .iter()
                .filter(|(server_id, schedule)| {
                    schedule.next_run_at_ms <= now_ms && !active_ids.contains(*server_id)
                })
                .filter_map(|(server_id, schedule)| {
                    let profile = profiles.iter().find(|profile| profile.id == *server_id)?;
                    profile
                        .auto_backup_enabled
                        .unwrap_or(false)
                        .then(|| (profile.clone(), schedule.signature.clone()))
                })
                .collect::<Vec<_>>();

            due_profiles
                .into_iter()
                .map(|(profile, signature)| {
                    let operation_id = uuid::Uuid::new_v4().to_string();
                    let cancellation = Arc::new(AtomicBool::new(false));
                    state.active_backups.insert(
                        profile.id.clone(),
                        ActiveBackup {
                            operation_id: operation_id.clone(),
                            cancellation: cancellation.clone(),
                        },
                    );
                    (profile, signature, operation_id, cancellation)
                })
                .collect::<Vec<_>>()
        };

        let mut results = Vec::with_capacity(jobs.len());
        for (profile, signature, operation_id, cancellation) in jobs {
            progress(AutoBackupProgressEvent {
                operation_id: operation_id.clone(),
                server_id: profile.id.clone(),
                fraction: 0.0,
                current_file: String::new(),
            });
            let result = run_automatic_backup(
                context.clone(),
                servers,
                limiter,
                registry,
                operations,
                &self.shutting_down,
                &profile,
                operation_id.clone(),
                cancellation.clone(),
                progress.clone(),
            )
            .await;
            let completed_at_ms = Local::now().timestamp_millis();
            {
                let mut state = self.state.lock().await;
                if let Some(schedule) = state.schedules.get_mut(&profile.id) {
                    if schedule.signature == signature {
                        schedule.next_run_at_ms = match result.status {
                            AutoBackupTickStatus::Created => {
                                next_backup_run(&profile, completed_at_ms, false)
                            }
                            AutoBackupTickStatus::Skipped | AutoBackupTickStatus::Failed => {
                                completed_at_ms.saturating_add(BACKUP_RETRY_DELAY_MS)
                            }
                        };
                    }
                }
                state.active_backups.remove(&profile.id);
            }
            results.push(result);
        }
        Ok(results)
    }
}

fn reconcile_schedules(state: &mut AutoBackupState, profiles: &[MinecraftServer], now_ms: i64) {
    let enabled = profiles
        .iter()
        .filter(|profile| profile.auto_backup_enabled.unwrap_or(false))
        .map(|profile| (profile.id.clone(), profile))
        .collect::<HashMap<_, _>>();
    state
        .schedules
        .retain(|server_id, _| enabled.contains_key(server_id));
    for (server_id, profile) in enabled {
        let signature = backup_schedule_signature(profile);
        if state
            .schedules
            .get(&server_id)
            .is_some_and(|schedule| schedule.signature == signature)
        {
            continue;
        }
        state.schedules.insert(
            server_id,
            BackupSchedule {
                signature,
                next_run_at_ms: next_backup_run(profile, now_ms, true),
            },
        );
    }
}

fn run_automatic_backup<'a, F>(
    context: ServerContext,
    servers: &'a ServerManager,
    limiter: &'a CommandLimiter,
    registry: &'a ServerRegistry,
    operations: &'a ServerOperationManager,
    shutting_down: &'a AtomicBool,
    profile: &'a MinecraftServer,
    operation_id: String,
    cancellation: Arc<AtomicBool>,
    progress: Arc<F>,
) -> impl std::future::Future<Output = AutoBackupTickResult> + 'a
where
    F: Fn(AutoBackupProgressEvent) + Send + Sync + 'static + ?Sized,
{
    async move {
        let mut result = AutoBackupTickResult {
            operation_id: operation_id.clone(),
            server_id: profile.id.clone(),
            server_name: profile.name.clone(),
            status: AutoBackupTickStatus::Failed,
            backup_name: None,
            catalog_error: None,
            retention: None,
            retention_error: None,
            error: None,
            restart_error: None,
        };

        if cancellation.load(Ordering::SeqCst) {
            result.status = AutoBackupTickStatus::Skipped;
            result.error = Some("Automatic backup was cancelled".to_string());
            return result;
        }
        if !servers.is_server_running(&profile.id).await {
            result.status = AutoBackupTickStatus::Skipped;
            result.error = Some("Automatic backup waits for the server to be running".to_string());
            return result;
        }
        let operation = match operations
            .acquire(&profile.id, OperationKind::BackupCreate)
            .await
        {
            Ok(operation) => operation,
            Err(error) => {
                result.error = Some(error);
                return result;
            }
        };
        if cancellation.load(Ordering::SeqCst) {
            result.status = AutoBackupTickStatus::Skipped;
            result.error = Some("Automatic backup was cancelled".to_string());
            return result;
        }

        if let Err(error) = server_process::stop_server_with_guard_recovery(
            servers,
            &profile.id,
            Some(&cancellation),
        )
        .await
        {
            let server_is_stopped = match error.recovery_state {
                StopErrorRecoveryState::Stopped => true,
                StopErrorRecoveryState::Cancelled => !servers.is_server_running(&profile.id).await,
                StopErrorRecoveryState::RunningOrUnconfirmed => false,
            };
            if server_is_stopped && should_restart_after_backup(profile, shutting_down) {
                if let Err(restart_error) = server_process::start_registered_server_with_guard(
                    context.clone(),
                    servers,
                    limiter,
                    operations,
                    registry,
                    profile.id.clone(),
                    operation,
                )
                .await
                {
                    result.restart_error = Some(restart_error);
                }
            }
            result.error = Some(error.message);
            return result;
        }

        let data_dir = context.data_dir.clone();
        let server_id = profile.id.clone();
        let backup_name = build_auto_backup_name_at(&profile.name, Local::now().timestamp_millis());
        let retain_count = bounded_u64(
            profile.auto_backup_retain_count.as_ref(),
            0,
            u32::MAX as u64,
        ) as u32;
        let retain_days =
            bounded_u64(profile.auto_backup_retain_days.as_ref(), 0, u32::MAX as u64) as u32;
        let cancel_for_create = cancellation.clone();
        let progress_for_create = progress.clone();
        let operation_for_progress = operation_id.clone();
        let server_for_progress = profile.id.clone();
        let name_for_create = backup_name.clone();
        let archive_result = tokio::task::spawn_blocking(move || {
            let source_dir = resolve_managed_request(
                &data_dir,
                &ManagedPathRequest {
                    root: ManagedRoot::Servers,
                    server_id: Some(server_id.clone()),
                    relative_path: String::new(),
                },
                false,
            )
            .map_err(CoreError::internal)?;
            let backup_dir = resolve_managed_request(
                &data_dir,
                &ManagedPathRequest {
                    root: ManagedRoot::Backups,
                    server_id: Some(server_id.clone()),
                    relative_path: String::new(),
                },
                true,
            )
            .map_err(CoreError::internal)?;
            create_backup(
                &source_dir,
                &backup_dir,
                CreateBackupRequest {
                    server_id: server_id.clone(),
                    backup_name: Some(name_for_create),
                    sources: None,
                    compression_level: None,
                    origin: BackupOrigin::Automatic,
                },
                Some(&cancel_for_create),
                &mut |backup_progress| {
                    progress_for_create(AutoBackupProgressEvent {
                        operation_id: operation_for_progress.clone(),
                        server_id: server_for_progress.clone(),
                        fraction: backup_progress.fraction,
                        current_file: backup_progress.current_file,
                    });
                },
            )
        })
        .await
        .map_err(|error| CoreError::internal(format!("Automatic backup task failed: {error}")))
        .and_then(|result| result);

        match archive_result {
            Ok(created) => {
                result.status = AutoBackupTickStatus::Created;
                result.backup_name = Some(created.backup_name);
                if let Some(error) = created.catalog_error {
                    result.catalog_error = Some(error.message);
                } else {
                    let backup_dir = resolve_managed_request(
                        &context.data_dir,
                        &ManagedPathRequest {
                            root: ManagedRoot::Backups,
                            server_id: Some(profile.id.clone()),
                            relative_path: String::new(),
                        },
                        true,
                    );
                    match backup_dir {
                        Ok(backup_dir) => {
                            let retention = apply_retention_at(
                                &backup_dir,
                                &profile.id,
                                retain_count,
                                retain_days,
                                Local::now().timestamp_millis().max(0) as u128,
                                Some(&cancellation),
                            );
                            match retention {
                                Ok(report) => result.retention = Some(report),
                                Err(error) => result.retention_error = Some(error.message),
                            }
                        }
                        Err(error) => result.retention_error = Some(error),
                    }
                }
            }
            Err(error) if error.code == crate::error::CoreErrorCode::OperationCancelled => {
                result.status = AutoBackupTickStatus::Skipped;
                result.error = Some("Automatic backup was cancelled".to_string());
            }
            Err(error) => result.error = Some(error.message),
        }

        if should_restart_after_backup(profile, shutting_down) {
            if let Err(error) = server_process::start_registered_server_with_guard(
                context,
                servers,
                limiter,
                operations,
                registry,
                profile.id.clone(),
                operation,
            )
            .await
            {
                result.restart_error = Some(error);
            }
        } else {
            drop(operation);
        }
        result
    }
}

fn should_restart_after_backup(profile: &MinecraftServer, shutting_down: &AtomicBool) -> bool {
    profile.backup_restart_after_safe_backup != Some(false) && !shutting_down.load(Ordering::SeqCst)
}

fn bounded_u64(value: Option<&Number>, default: u64, maximum: u64) -> u64 {
    let normalized = value
        .and_then(|number| {
            number
                .as_i64()
                .map(|signed| signed.max(0) as u64)
                .or_else(|| number.as_u64())
                .or_else(|| {
                    number
                        .as_f64()
                        .and_then(|value| value.is_finite().then(|| value.floor().max(0.0) as u64))
                })
        })
        .unwrap_or(default);
    normalized.min(maximum)
}

fn backup_interval_minutes(profile: &MinecraftServer) -> u64 {
    bounded_u64(
        profile.auto_backup_interval_min.as_ref(),
        60,
        MAX_BACKUP_INTERVAL_MINUTES,
    )
    .max(1)
}

fn backup_time(profile: &MinecraftServer) -> NaiveTime {
    profile
        .auto_backup_time
        .as_deref()
        .and_then(parse_backup_time)
        .unwrap_or_else(|| NaiveTime::from_hms_opt(3, 0, 0).expect("valid default time"))
}

fn parse_backup_time(value: &str) -> Option<NaiveTime> {
    let bytes = value.trim().as_bytes();
    if bytes.len() != 5
        || bytes[2] != b':'
        || !bytes[0..2].iter().all(u8::is_ascii_digit)
        || !bytes[3..5].iter().all(u8::is_ascii_digit)
    {
        return None;
    }
    let hour = u32::from(bytes[0] - b'0') * 10 + u32::from(bytes[1] - b'0');
    let minute = u32::from(bytes[3] - b'0') * 10 + u32::from(bytes[4] - b'0');
    NaiveTime::from_hms_opt(hour, minute, 0)
}

fn backup_weekday(profile: &MinecraftServer) -> u32 {
    bounded_u64(profile.auto_backup_weekday.as_ref(), 0, 6) as u32
}

fn backup_schedule_type(profile: &MinecraftServer) -> ScheduleType {
    match profile.auto_backup_schedule_type.as_deref() {
        Some("daily") => ScheduleType::Daily,
        Some("weekly") => ScheduleType::Weekly,
        _ => ScheduleType::Interval,
    }
}

fn backup_schedule_signature(profile: &MinecraftServer) -> String {
    match backup_schedule_type(profile) {
        ScheduleType::Interval => format!("interval:{}", backup_interval_minutes(profile)),
        ScheduleType::Daily => format!("daily:{}", backup_time(profile).format("%H:%M")),
        ScheduleType::Weekly => format!(
            "weekly:{}:{}",
            backup_weekday(profile),
            backup_time(profile).format("%H:%M")
        ),
    }
}

/// Computes the configured next due time using a fixed Unix-millisecond
/// clock. With no prior backup, interval schedules start after one interval;
/// daily and weekly schedules may run immediately only when `now_ms` is in
/// the configured minute. With a prior backup, interval schedules are based
/// on that timestamp, while daily and weekly schedules choose the first
/// configured local occurrence strictly after it. The manager's live tick
/// intentionally keeps its in-memory backend behavior and does not persist
/// this timestamp across process starts.
pub fn compute_next_due(
    profile: &MinecraftServer,
    now_ms: i64,
    last_backup_ms: Option<i64>,
) -> AutoBackupDue {
    if !profile.auto_backup_enabled.unwrap_or(false) {
        return AutoBackupDue {
            due: false,
            next_due_at_ms: None,
        };
    }

    let next_due_at_ms = match backup_schedule_type(profile) {
        ScheduleType::Interval => last_backup_ms
            .unwrap_or(now_ms)
            .saturating_add((backup_interval_minutes(profile) as i64).saturating_mul(60_000)),
        schedule => match last_backup_ms {
            Some(last_backup_ms) => next_time_based_backup_run(
                schedule,
                backup_time(profile),
                backup_weekday(profile),
                last_backup_ms,
            )
            .unwrap_or_else(|| now_ms.saturating_add(BACKUP_RETRY_DELAY_MS)),
            None => next_backup_run(profile, now_ms, true),
        },
    };
    AutoBackupDue {
        due: next_due_at_ms <= now_ms,
        next_due_at_ms: Some(next_due_at_ms),
    }
}

fn next_backup_run(profile: &MinecraftServer, now_ms: i64, allow_current_minute: bool) -> i64 {
    match backup_schedule_type(profile) {
        ScheduleType::Interval => {
            now_ms.saturating_add((backup_interval_minutes(profile) as i64).saturating_mul(60_000))
        }
        schedule => {
            if allow_current_minute {
                if let Some(now) = Local.timestamp_millis_opt(now_ms).single() {
                    let target_time = backup_time(profile);
                    let matches = now.hour() == target_time.hour()
                        && now.minute() == target_time.minute()
                        && (schedule != ScheduleType::Weekly
                            || now.weekday().num_days_from_sunday() == backup_weekday(profile));
                    if matches {
                        return now_ms;
                    }
                }
            }
            next_time_based_backup_run(
                schedule,
                backup_time(profile),
                backup_weekday(profile),
                now_ms,
            )
            .unwrap_or_else(|| now_ms.saturating_add(60_000))
        }
    }
}

fn next_time_based_backup_run(
    schedule: ScheduleType,
    time: NaiveTime,
    weekday: u32,
    now_ms: i64,
) -> Option<i64> {
    let now = Local.timestamp_millis_opt(now_ms).single()?;
    let today = now.date_naive();
    for offset in 0..=7 {
        let date = today.checked_add_days(chrono::Days::new(offset))?;
        if schedule == ScheduleType::Weekly && date.weekday().num_days_from_sunday() != weekday {
            continue;
        }
        let candidate = date.and_time(time);
        match Local.from_local_datetime(&candidate) {
            LocalResult::Single(value) if value.timestamp_millis() > now_ms => {
                return Some(value.timestamp_millis());
            }
            LocalResult::Ambiguous(first, second) => {
                if let Some(value) = [first, second]
                    .into_iter()
                    .filter(|value| value.timestamp_millis() > now_ms)
                    .min_by_key(|value| value.timestamp_millis())
                {
                    return Some(value.timestamp_millis());
                }
            }
            LocalResult::None | LocalResult::Single(_) => {}
        }
    }
    None
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ScheduleType {
    Interval,
    Daily,
    Weekly,
}

/// Replaces characters that are unsafe in a filename and normalizes repeated
/// dots and hyphens to match the renderer's historical naming rules.
pub fn sanitize_backup_server_name(name: &str) -> String {
    let mut normalized = String::with_capacity(name.len());
    let mut chars = name.chars().peekable();
    while let Some(character) = chars.next() {
        if character == '.' && chars.peek() == Some(&'.') {
            while chars.peek() == Some(&'.') {
                chars.next();
            }
            normalized.push('-');
        } else if u32::from(character) <= 0x1f
            || u32::from(character) == 0x7f
            || "\\/:*?\"<>|".contains(character)
        {
            normalized.push('-');
        } else {
            normalized.push(character);
        }
    }
    let mut collapsed = String::with_capacity(normalized.len());
    let mut previous_hyphen = false;
    for character in normalized.trim().chars() {
        if character == '-' {
            if !previous_hyphen {
                collapsed.push(character);
            }
            previous_hyphen = true;
        } else {
            collapsed.push(character);
            previous_hyphen = false;
        }
    }
    let trimmed = collapsed.trim_matches('-');
    if trimmed.is_empty() {
        "server".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Builds a full backup archive name from a fixed Unix-millisecond clock.
pub fn build_manual_backup_name_at(server_name: &str, now_ms: i64) -> String {
    build_backup_name_at("Backup", server_name, now_ms)
}

/// Builds an automatic backup archive name from a fixed Unix-millisecond clock.
pub fn build_auto_backup_name_at(server_name: &str, now_ms: i64) -> String {
    build_backup_name_at("AutoBackup", server_name, now_ms)
}

fn build_backup_name_at(prefix: &str, server_name: &str, now_ms: i64) -> String {
    let timestamp = Local
        .timestamp_millis_opt(now_ms)
        .single()
        .map(|value| value.format("%Y-%m-%d-%H-%M-%S-%3f").to_string())
        .unwrap_or_else(|| "1970-01-01-00-00-00-000".to_string());
    format!(
        "{prefix} {} {timestamp}.zip",
        sanitize_backup_server_name(server_name)
    )
}

/// Returns the current daily/weekly key, matching the renderer helper.
pub fn build_time_based_auto_backup_key(
    schedule_type: Option<&str>,
    time: Option<&str>,
    weekday: Option<f64>,
    now_ms: i64,
) -> Option<String> {
    let schedule = match schedule_type {
        Some("daily") => ScheduleType::Daily,
        Some("weekly") => ScheduleType::Weekly,
        _ => ScheduleType::Interval,
    };
    if schedule == ScheduleType::Interval {
        return None;
    }
    let target_time = time
        .and_then(parse_backup_time)
        .unwrap_or_else(|| NaiveTime::from_hms_opt(3, 0, 0).expect("valid default time"));
    let target_weekday = weekday
        .filter(|value| value.is_finite())
        .unwrap_or(0.0)
        .floor()
        .clamp(0.0, 6.0) as u32;
    let now = Local.timestamp_millis_opt(now_ms).single()?;
    if now.hour() != target_time.hour() || now.minute() != target_time.minute() {
        return None;
    }
    if schedule == ScheduleType::Weekly && now.weekday().num_days_from_sunday() != target_weekday {
        return None;
    }
    let name = match schedule {
        ScheduleType::Daily => "daily",
        ScheduleType::Weekly => "weekly",
        ScheduleType::Interval => unreachable!(),
    };
    Some(format!(
        "{name}-{}-{}",
        now.format("%Y-%m-%d"),
        target_time.format("%H-%M")
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::CoreErrorCode;
    use chrono::NaiveDate;
    use std::fs;
    use std::sync::atomic::AtomicBool;

    use super::super::catalog::apply_retention_at;
    use super::super::create::{create_backup, CreateBackupRequest};
    use super::super::BackupOrigin;
    use crate::metric_history::MetricHistorySnapshot;
    use crate::server_process::{
        CommandLimiter, ServerContext, ServerEvents, ServerLogEvent, ServerManager,
        ServerStatsEvent, ServerStatusEvent,
    };

    fn profile() -> MinecraftServer {
        let mut profile: MinecraftServer = serde_json::from_value(serde_json::json!({
            "id":"server-1", "name":"Test Server", "version":"1.21.1", "software":"paper",
            "port":25565, "memory":4096, "path":"servers/server-1", "status":"offline",
            "autoBackupEnabled":true, "autoBackupIntervalMin":30,
            "autoBackupScheduleType":"interval", "autoBackupTime":"03:00",
            "autoBackupWeekday":0, "autoBackupRetainCount":0, "autoBackupRetainDays":0
        }))
        .expect("valid server profile");
        profile.backup_restart_after_safe_backup = None;
        profile
    }

    fn local_ms(date: NaiveDate, hour: u32, minute: u32, second: u32) -> i64 {
        Local
            .from_local_datetime(&date.and_hms_opt(hour, minute, second).expect("time"))
            .single()
            .expect("unambiguous local test time")
            .timestamp_millis()
    }

    struct NoopServerEvents;

    impl ServerEvents for NoopServerEvents {
        fn log(&self, _: ServerLogEvent) {}
        fn status(&self, _: &ServerStatusEvent) {}
        fn stats(&self, _: ServerStatsEvent) {}
        fn metrics(&self, _: &MetricHistorySnapshot) {}
    }

    #[test]
    fn interval_schedule_starts_after_interval_and_is_clamped_to_one_day() {
        let mut server = profile();
        assert_eq!(next_backup_run(&server, 1_000, true), 1_801_000);
        server.auto_backup_interval_min = Some(Number::from(9_000));
        assert_eq!(next_backup_run(&server, 1_000, true), 86_401_000);
        server.auto_backup_interval_min = Some(Number::from(0));
        assert_eq!(next_backup_run(&server, 1_000, true), 61_000);
    }

    #[test]
    fn public_interval_due_query_uses_enable_time_then_last_backup_time() {
        let server = profile();
        let first = compute_next_due(&server, 1_000, None);
        assert_eq!(
            first,
            AutoBackupDue {
                due: false,
                next_due_at_ms: Some(1_801_000),
            }
        );

        let after_last_backup = compute_next_due(&server, 1_801_000, Some(1_000));
        assert_eq!(
            after_last_backup,
            AutoBackupDue {
                due: true,
                next_due_at_ms: Some(1_801_000),
            }
        );
        let before_last_backup_due = compute_next_due(&server, 1_800_999, Some(1_000));
        assert_eq!(before_last_backup_due.next_due_at_ms, Some(1_801_000));
        assert!(!before_last_backup_due.due);
    }

    #[test]
    fn public_due_query_returns_no_schedule_when_disabled() {
        let mut server = profile();
        server.auto_backup_enabled = Some(false);
        assert_eq!(
            compute_next_due(&server, 1_000, None),
            AutoBackupDue {
                due: false,
                next_due_at_ms: None,
            }
        );
    }

    #[test]
    fn first_daily_enable_runs_in_the_current_minute_then_skips_it() {
        let mut server = profile();
        server.auto_backup_schedule_type = Some("daily".to_string());
        let date = NaiveDate::from_ymd_opt(2026, 10, 29).expect("date");
        let now_ms = local_ms(date, 3, 0, 30);
        assert_eq!(next_backup_run(&server, now_ms, true), now_ms);
        let next = next_backup_run(&server, now_ms, false);
        assert!(next > now_ms);
        assert_eq!(
            Local
                .timestamp_millis_opt(next)
                .single()
                .unwrap()
                .date_naive(),
            date.succ_opt().unwrap()
        );
    }

    #[test]
    fn public_daily_due_query_uses_current_minute_only_without_a_prior_backup() {
        let mut server = profile();
        server.auto_backup_schedule_type = Some("daily".to_string());
        let today = NaiveDate::from_ymd_opt(2026, 10, 29).expect("date");
        let in_target_minute = local_ms(today, 3, 0, 30);
        assert_eq!(
            compute_next_due(&server, in_target_minute, None),
            AutoBackupDue {
                due: true,
                next_due_at_ms: Some(in_target_minute),
            }
        );

        let prior_backup = local_ms(today, 2, 59, 0);
        let after_target_minute = local_ms(today, 3, 1, 0);
        assert_eq!(
            compute_next_due(&server, after_target_minute, Some(prior_backup)),
            AutoBackupDue {
                due: true,
                next_due_at_ms: Some(local_ms(today, 3, 0, 0)),
            }
        );
        let completed_at_target = local_ms(today, 3, 0, 30);
        let next_day = compute_next_due(&server, completed_at_target, Some(completed_at_target));
        assert!(!next_day.due);
        assert_eq!(
            Local
                .timestamp_millis_opt(next_day.next_due_at_ms.unwrap())
                .single()
                .unwrap()
                .date_naive(),
            today.succ_opt().unwrap()
        );
    }

    #[test]
    fn weekly_schedule_uses_sunday_zero() {
        let server = profile();
        let mut server = server;
        server.auto_backup_schedule_type = Some("weekly".to_string());
        server.auto_backup_weekday = Some(Number::from(0));
        let sunday = NaiveDate::from_ymd_opt(2026, 10, 25).expect("Sunday");
        let now_ms = local_ms(sunday, 22, 0, 0);
        let next = next_backup_run(&server, now_ms, false);
        let next_local = Local.timestamp_millis_opt(next).single().unwrap();
        assert_eq!(next_local.weekday().num_days_from_sunday(), 0);
        assert!(next > now_ms);
    }

    #[test]
    fn public_weekly_due_query_uses_sunday_zero_after_last_backup() {
        let mut server = profile();
        server.auto_backup_schedule_type = Some("weekly".to_string());
        server.auto_backup_weekday = Some(Number::from(0));
        let previous_sunday = NaiveDate::from_ymd_opt(2026, 10, 18).expect("Sunday");
        let this_sunday = NaiveDate::from_ymd_opt(2026, 10, 25).expect("Sunday");
        let last_backup_ms = local_ms(previous_sunday, 3, 0, 0);
        let now_ms = local_ms(this_sunday, 3, 0, 15);
        assert_eq!(
            compute_next_due(&server, now_ms, Some(last_backup_ms)),
            AutoBackupDue {
                due: true,
                next_due_at_ms: Some(local_ms(this_sunday, 3, 0, 0)),
            }
        );
    }

    #[test]
    fn time_based_key_uses_local_date_and_sunday_zero() {
        let sunday = NaiveDate::from_ymd_opt(2026, 10, 25).expect("Sunday");
        let now_ms = local_ms(sunday, 3, 0, 15);
        assert_eq!(
            build_time_based_auto_backup_key(Some("weekly"), Some("03:00"), Some(0.9), now_ms),
            Some("weekly-2026-10-25-03-00".to_string())
        );
        assert_eq!(
            build_time_based_auto_backup_key(Some("daily"), Some("bad"), None, now_ms),
            Some("daily-2026-10-25-03-00".to_string())
        );
    }

    #[test]
    fn unchanged_settings_keep_due_time_and_first_enabling_reconciles_immediately() {
        let mut state = AutoBackupState::default();
        let mut server = profile();
        server.auto_backup_schedule_type = Some("daily".to_string());
        let now_ms = local_ms(NaiveDate::from_ymd_opt(2026, 10, 29).unwrap(), 3, 0, 10);
        reconcile_schedules(&mut state, std::slice::from_ref(&server), now_ms);
        assert_eq!(state.schedules[&server.id].next_run_at_ms, now_ms);
        let first_due = state.schedules[&server.id].next_run_at_ms;
        reconcile_schedules(&mut state, std::slice::from_ref(&server), now_ms + 1_000);
        assert_eq!(state.schedules[&server.id].next_run_at_ms, first_due);
        server.auto_backup_time = Some("04:00".to_string());
        reconcile_schedules(&mut state, &[server.clone()], now_ms + 1_000);
        assert!(state.schedules[&server.id].next_run_at_ms > now_ms + 1_000);
    }

    #[test]
    fn zero_retention_settings_are_kept_as_unlimited_values() {
        let server = profile();
        assert_eq!(
            bounded_u64(server.auto_backup_retain_count.as_ref(), 0, u32::MAX as u64),
            0
        );
        assert_eq!(
            bounded_u64(server.auto_backup_retain_days.as_ref(), 0, u32::MAX as u64),
            0
        );
    }

    #[tokio::test]
    async fn tick_returns_a_skipped_result_when_a_due_server_is_offline() {
        let root = tempfile::tempdir().expect("temporary scheduler fixture");
        let registry = ServerRegistry::open(root.path()).expect("open test registry");
        let mut server = profile();
        server.auto_backup_schedule_type = Some("daily".to_string());
        server.auto_backup_time = Some(Local::now().format("%H:%M").to_string());
        registry.add_server(&server).expect("register test server");

        let manager = AutoBackupManager::default();
        let results = manager
            .tick(
                ServerContext {
                    data_dir: root.path().to_path_buf(),
                    java_registry: Arc::new(crate::java::ConfigJavaRegistry::new(root.path())),
                    events: Arc::new(NoopServerEvents),
                },
                &ServerManager::default(),
                &CommandLimiter::default(),
                &registry,
                &ServerOperationManager::default(),
                Local::now().timestamp_millis(),
                Arc::new(|_| {}),
            )
            .await
            .expect("run due automatic backup tick");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].server_id, server.id);
        assert_eq!(results[0].status, AutoBackupTickStatus::Skipped);
        assert_eq!(
            results[0].error.as_deref(),
            Some("Automatic backup waits for the server to be running")
        );
        assert!(results[0].backup_name.is_none());
    }

    #[test]
    fn automatic_create_retention_preserves_unlimited_and_manual_archives() {
        let root = tempfile::tempdir().expect("temporary backup fixture");
        let source_dir = root.path().join("server");
        let backup_dir = root.path().join("backups");
        fs::create_dir_all(&source_dir).expect("create managed server fixture");
        fs::create_dir_all(&backup_dir).expect("create backup fixture");
        fs::write(source_dir.join("server.properties"), b"level-name=world\n")
            .expect("write server fixture");

        let create = |name: &str, origin| {
            create_backup(
                &source_dir,
                &backup_dir,
                CreateBackupRequest {
                    server_id: "server-1".to_string(),
                    backup_name: Some(name.to_string()),
                    sources: None,
                    compression_level: None,
                    origin,
                },
                None,
                &mut |_| {},
            )
            .expect("create test archive")
        };
        create(
            "AutoBackup server 2026-10-25-03-00-00-001.zip",
            BackupOrigin::Automatic,
        );
        create(
            "AutoBackup server 2026-10-25-03-00-00-002.zip",
            BackupOrigin::Automatic,
        );
        create(
            "Backup server 2026-10-25-03-00-00-003.zip",
            BackupOrigin::Manual,
        );

        let unlimited = apply_retention_at(&backup_dir, "server-1", 0, 0, 1_798_000_000_000, None)
            .expect("zero count and days should be unlimited");
        assert!(unlimited.deleted_names.is_empty());
        assert_eq!(unlimited.records.len(), 3);

        let bounded = apply_retention_at(&backup_dir, "server-1", 1, 0, 1_798_000_000_000, None)
            .expect("apply automatic count retention");
        assert_eq!(bounded.deleted_names.len(), 1);
        let remaining_automatic = [
            "AutoBackup server 2026-10-25-03-00-00-001.zip",
            "AutoBackup server 2026-10-25-03-00-00-002.zip",
        ]
        .into_iter()
        .filter(|name| backup_dir.join(name).exists())
        .count();
        assert_eq!(remaining_automatic, 1);
        assert!(backup_dir
            .join("Backup server 2026-10-25-03-00-00-003.zip")
            .exists());
    }

    #[test]
    fn cancelled_automatic_create_and_retention_leave_existing_archives_intact() {
        let root = tempfile::tempdir().expect("temporary backup fixture");
        let source_dir = root.path().join("server");
        let backup_dir = root.path().join("backups");
        fs::create_dir_all(&source_dir).expect("create managed server fixture");
        fs::create_dir_all(&backup_dir).expect("create backup fixture");
        fs::write(source_dir.join("server.properties"), b"level-name=world\n")
            .expect("write server fixture");
        let existing = create_backup(
            &source_dir,
            &backup_dir,
            CreateBackupRequest {
                server_id: "server-1".to_string(),
                backup_name: Some("AutoBackup existing 2026-10-25-03-00-00-001.zip".to_string()),
                sources: None,
                compression_level: None,
                origin: BackupOrigin::Automatic,
            },
            None,
            &mut |_| {},
        )
        .expect("create existing automatic archive");

        let cancellation = AtomicBool::new(true);
        let cancelled_create = create_backup(
            &source_dir,
            &backup_dir,
            CreateBackupRequest {
                server_id: "server-1".to_string(),
                backup_name: Some("AutoBackup cancelled 2026-10-25-03-00-00-002.zip".to_string()),
                sources: None,
                compression_level: None,
                origin: BackupOrigin::Automatic,
            },
            Some(&cancellation),
            &mut |_| {},
        )
        .expect_err("cancelled create must fail");
        assert_eq!(cancelled_create.code, CoreErrorCode::OperationCancelled);
        assert!(!backup_dir
            .join("AutoBackup cancelled 2026-10-25-03-00-00-002.zip")
            .exists());

        let cancelled_retention = apply_retention_at(
            &backup_dir,
            "server-1",
            0,
            0,
            1_798_000_000_000,
            Some(&cancellation),
        )
        .expect_err("cancelled retention must fail");
        assert_eq!(cancelled_retention.code, CoreErrorCode::OperationCancelled);
        assert!(backup_dir.join(existing.backup_name).exists());
    }

    #[test]
    fn backup_names_match_the_millisecond_and_filename_rules() {
        assert_eq!(sanitize_backup_server_name(" ../A:B  "), "A-B");
        let now_ms = local_ms(NaiveDate::from_ymd_opt(2026, 10, 29).unwrap(), 3, 0, 10) + 123;
        let manual = build_manual_backup_name_at("A/B", now_ms);
        assert!(manual.starts_with("Backup A-B 2026-10-29-03-00-10-123.zip"));
        assert!(build_auto_backup_name_at("A/B", now_ms).starts_with("AutoBackup A-B "));
    }

    #[test]
    fn windows_server_paths_round_trip_through_json_escaping() {
        let mut server = profile();
        let windows_path = r"C:\Users\Test User\AppData\Roaming\MC-Vector\servers\server-1";
        server.path = windows_path.to_string();

        let encoded = serde_json::to_string(&server).expect("encode Windows server profile");
        assert!(encoded.contains(
            r#""path":"C:\\Users\\Test User\\AppData\\Roaming\\MC-Vector\\servers\\server-1""#
        ));
        let decoded: MinecraftServer = serde_json::from_str(&encoded).expect("decode profile");
        assert_eq!(decoded.path, windows_path);
    }

    #[test]
    fn automatic_backup_restart_defaults_to_true_and_honors_opt_out() {
        let mut server = profile();
        let shutting_down = AtomicBool::new(false);
        assert!(should_restart_after_backup(&server, &shutting_down));
        server.backup_restart_after_safe_backup = Some(false);
        assert!(!should_restart_after_backup(&server, &shutting_down));
        server.backup_restart_after_safe_backup = None;
        shutting_down.store(true, Ordering::SeqCst);
        assert!(!should_restart_after_backup(&server, &shutting_down));
    }
}
