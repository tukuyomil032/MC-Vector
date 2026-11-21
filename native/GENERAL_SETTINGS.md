# General Settings API

The shared core owns General Settings reads and writes. Native uses separate
`ServerSettings`, `ServerSettingsUpdate`, and `ServerSettingsSaveResult` records;
the existing `ServerProfile` remains source compatible. The server path is
read-only. Updates are allowed while running and serialize with other mutations
through the server operation lock.

## Public interfaces

These settings-specific interfaces implement the General Settings portion of
UI-014 and OP-SRV-001/002. They supplement the existing profile-list query and
the Tauri `update_server` compatibility adapter:

| Operation | Native interface | Result |
| --- | --- | --- |
| OP-SRV-001 settings query | `get_server_settings(server_id)` | `ServerSettings` |
| OP-SRV-002 settings save | `update_server_settings(server_id, settings)` | `ServerSettingsSaveResult` |

Both require a registered managed server. They acquire the server operation lock,
provide no progress or cancellation, and surface stable `server_settings.*`
errors. Saving does not reject a running server.

FFI (Rust / UniFFI):

```rust
get_server_settings(server_id: String) -> Result<ServerSettings, FfiError>
update_server_settings(server_id: String, settings: ServerSettingsUpdate)
    -> Result<ServerSettingsSaveResult, FfiError>
```

Both functions are async. Core exposes the same names with the shared
`ServerOperationManager`, application data directory, and registry as additional
arguments, returning `CoreError`. Tauri retains `update_server(server)` and its
boolean response through the core's compatibility adapter.

Swift (`Task.detached` keeps work off the main actor):

```swift
func serverSettings(serverID: String) async throws(CoreError) -> ServerSettings
func updateServerSettings(serverID: String, settings: ServerSettingsUpdate)
    async throws(CoreError) -> ServerSettingsSaveResult
```

The read record includes `server_id`, read-only `server_path`, and all General
Settings fields. The update record omits the ID and path; its optional
`backup_restart_after_safe_backup` preserves the stored value when omitted.
`AutoBackupScheduleType` is an enum with `Interval`, `Daily`, and `Weekly` cases.
`ServerSettingsSaveResult` contains the saved `settings` and `restart_required`.

## Defaults

Missing optional registry fields use the values displayed by
`src/renderer/components/properties/ServerSettings.tsx::toForm`:

| Field | Default |
| --- | --- |
| profile_name, group_name, jvm_args | Empty string |
| java_path | Automatic Java selection (no explicit path) |
| software when empty | Paper |
| auto_restart_on_crash | false |
| max_auto_restarts | 3 |
| auto_restart_delay_sec | 5 seconds |
| auto_backup_enabled | false |
| auto_backup_schedule_type | interval |
| auto_backup_interval_min | 60 minutes |
| auto_backup_time | 03:00 |
| auto_backup_weekday | 0 (Sunday) |
| auto_backup_retain_count, auto_backup_retain_days | 0 (unlimited) |
| notify_on_crash | true |
| notify_on_start, notify_on_high_cpu | false |
| notify_high_cpu_threshold | 90 percent |

`backup_restart_after_safe_backup` is not rendered by the current General
Settings form. Its default is **true**, matching the existing automation policy
(`src-tauri/src/commands/automation.rs`). Name, version, memory in MB, port, and
path come from the required registry fields; they have no missing-field default.

## Validation

Typed saves reject invalid values rather than silently clamping them:

| Field | Accepted values |
| --- | --- |
| name | Nonempty after trimming, at most 128 bytes, no control characters or `/`, `\`, `:` |
| memory_mb | 1024–1048576 when changed; an unchanged legacy value is preserved |
| port | 1–65535 |
| max_auto_restarts | 0–20 |
| auto_restart_delay_sec | 1–300 seconds |
| auto_backup_interval_min | 1–1440 minutes |
| auto_backup_schedule_type | interval, daily, weekly |
| auto_backup_time | 24-hour HH:mm |
| auto_backup_weekday | 0–6 (Sunday–Saturday) |
| auto_backup_retain_count | 0–999 |
| auto_backup_retain_days | 0–365 |
| notify_high_cpu_threshold | 1–100 percent |

Software must be a supported software identifier. Version may be empty for an
imported server whose version is unknown; it is limited to 128 bytes without
control characters. Profile and group names are
trimmed, at most 128 bytes, and cannot contain control characters. JVM arguments
use the existing Java policy, including the tuning flags in React's presets;
unsafe executable-loading and command arguments remain refused. An unset or
empty Java setting selects Automatic, and `system` selects Java on PATH. A
changed explicit path must pass the existing managed/trusted-system executable
policy.

Failures use `invalid_name`, `invalid_memory`, `invalid_port`,
`invalid_request`, `not_found`, `unmanaged`, `io`, or `registry`, each prefixed
with `server_settings.`. English and Japanese translations live in
`Resources/native-strings.json` and the generated string catalog.

## Restart and artifact behavior

Changes to Java, memory, port, JVM arguments, software, or version set
`restart_required`. Other settings do not require a restart. This is a comparison
of saved settings, independent of whether a process is currently running.

React exposes editable software and version controls alongside an optional
upgrade wizard. General Settings therefore saves these metadata fields in both
editions. It does not download or replace a server jar; artifact upgrades remain
a separate operation.

When port changes, the core patches `server-port` in an existing
`server.properties`, preserving comments, whitespace, BOM, and line endings via
the properties module. A missing file is left missing. The registry write is
atomic; failure after patching the file attempts to restore its original bytes.
The registry and file are separate storage systems, so they are not one durable
cross-file transaction.

## Tauri compatibility limits

The command name, camelCase full-profile input, and boolean response remain
unchanged, including `false` when the ID is no longer registered. The adapter
now applies the same validation and managed-folder checks as Native, so invalid
profiles that the previous registry-only command accepted are rejected. Its
legacy restart/schedule numbers retain the React normalization behavior; Native
typed saves reject out-of-range input.

Legacy numeric memory values remain readable even outside the new save range.
An unchanged legacy memory value can be saved with edits to other fields; a
changed memory value must satisfy the new range.

The adapter preserves the stored path, status, creation metadata, and unknown
fields instead of accepting replacements from the settings payload. It also
preserves the hidden backup restart flag when omitted. Tauri's boolean response
cannot carry `restart_required`; the Native result exposes it. Existing React
save/toast behavior is unchanged.
