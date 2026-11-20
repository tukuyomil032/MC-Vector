# Native Plugins API

The shared Rust core owns provider catalogs, compatibility, installed inventory,
installation plans and transactional replacement. Native uses typed UniFFI
records and `CoreClient` wrappers; arbitrary download URLs and destination paths
are not accepted by the Native installer boundary.

## Public interfaces

| Operation | Swift API | Result |
| --- | --- | --- |
| Server capability | `CoreClient.pluginSupport(software:)` | `PluginServerSupport` |
| Search | `CoreClient.searchPlugins(_:)` | `PluginSearchPage` (items, optional total) |
| Versions | `CoreClient.pluginVersions(project:software:)` | `[PluginVersionRecord]` (none for SpigotMC) |
| Categories | `CoreClient.pluginCategories(source:)` | `[PluginCategory]` |
| Safe README | `CoreClient.pluginReadmeHTML(source:body:projectURL:)` | sanitized HTML |
| Installed inventory | `CoreClient.installedPlugins(serverID:checkUpdates:)` | `[InstalledPlugin]` |
| Prepare | `CoreClient.preparePluginInstall(serverID:project:replaceFileName:)` | `PluginInstallPreview` |
| Execute | `CoreClient.executePluginInstall(token:confirmedDependencyIDs:)` | `PluginInstallOperation` |
| Bulk update | `CoreClient.bulkUpdatePlugins(serverID:)` | `PluginBulkOperation` |
| Toggle enabled | `CoreClient.toggleInstalledPlugin(serverID:fileName:)` | new file name |
| Uninstall | `CoreClient.uninstallPlugin(serverID:fileName:)` | `Void` |
| Cancellation | `CoreClient.cancelPluginOperation(operationID:)` | request accepted |

Query and mutation wrappers use `async throws(CoreError)`. Search takes a typed
source, query, server software and game version, offset/limit, sort and optional
category. Project records normalize provider identifiers, labels, URLs,
downloads, compatibility and supported versions, and carry the `PluginProject`
reference that prepare and README calls take. `plugin_failure_policy` exposes typed dialog
decisions to UniFFI callers. Installed records distinguish tracked origins from
local files and report update lookup failures separately.

## Progress and cancellation

Install and bulk handles return an operation ID and a bounded
`AsyncStream` with `bufferingNewest(1)`. The observer is connected before the
worker starts. Consume progress for display and await `value()` for the terminal
result. Dropping the stream does not cancel the worker. Cancellation acceptance
does not mean the worker has already stopped.

Install progress reports artifact identity and downloaded/total bytes. Bulk
progress reports the current file and completed/total item count. Bulk executes
items sequentially through the same prepare/execute installer and returns each
item as updated, skipped with a reason, or failed with an error. Cancellation is
checked between items; an already committing transaction is allowed to complete.

## Safety rules

Prepare returns a short-lived token bound to the registered server profile and
filesystem inventory. Execute consumes it once and requires the exact displayed
dependency acknowledgments. The core rechecks the plan after downloads and before
commit. Per-server `ArtifactInstall` operation locks coordinate with other
mutations. Recovery journals, staging and atomic replacement remain in the core.
Source/HTTPS/host, size, checksum, JAR, filename, managed-root and symlink checks
apply to Native and Tauri alike. Missing checksums require the persisted explicit
unverified-download preference; a checksum establishes byte integrity only.

README rendering uses GFM Markdown and an HTML allowlist. Scripts, styles,
iframes, forms, event handlers and unsafe URL schemes are removed. Images,
links, tables and code remain supported. Resolve permitted relative references
against the project URL before displaying the result.

Errors cross the boundary as `CoreError { code, message, retryable }`.
Plugin codes include `plugin.catalog_failed`, `plugin.invalid_request`,
`plugin.install_failed`, `plugin.session_expired`, and `plugin.io`.
Cancellation uses `operation.cancelled`. Local data-root paths are redacted.
Do not automatically repeat a consumed installation token; prepare a new preview
and present it before retrying.
