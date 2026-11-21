# Native Java Runtime and Server Change API

The shared Rust core owns the Java runtime registry, Adoptium downloads, safe
archive extraction, the Java requirement of each Minecraft version, and server
jar upgrades (`mcvector_core::java`, `mcvector_core::server_upgrade`). The Tauri
commands `get_java_versions`, `download_java`, `delete_java`,
`prepare_server_jar_install` and `execute_server_jar_install` are thin wrappers
over the same code, so both editions share one install layout, one registry and
one recovery journal. Swift uses typed `CoreClient` methods; it never passes
download URLs or destination paths.

## Java runtimes

| Operation | Swift API | Result |
| --- | --- | --- |
| Installed runtimes | `CoreClient.javaRuntimes()` | `[JavaRuntimeRecord]`, newest major first |
| LTS releases | `CoreClient.javaAvailableReleases()` | `JavaReleaseList` |
| Download and install | `CoreClient.installJava(major:)` | `JavaInstallOperation` |
| Cancel install | `JavaInstallOperation.cancel()` or `CoreClient.cancelJavaInstall(operationID:)` | `Bool`, whether the ID was active |
| Delete | `CoreClient.deleteJava(major:)` | `Void` |
| Add a custom runtime | `CoreClient.addCustomJava(path:)` | `JavaRuntimeRecord` |
| Requirement of a version | `CoreClient.requiredJava(software:version:)` | optional `JavaRequirementRecord` |
| Resolve a server's Java | `CoreClient.resolveJava(serverID:)` | `JavaResolution` |
| A server's Java check | `CoreClient.javaCompatibility(serverID:)` | `ServerJavaCompatibility` |

`JavaRuntimeRecord` has `major`, the full `version` when known (`21.0.5`),
`name`, `path`, `executable`, optional `vendor`, `origin` (`.managed` or
`.custom`) and `available` (the executable still exists). `path` is the value
to store as a server's Java path: the Java home for managed runtimes, the
picked path for custom ones. Listing reads the registry and each runtime's
`release` file; it never starts a process.

`JavaReleaseList.releases` are Adoptium's `available_lts_releases`, newest
first, each with `installed` (any registered runtime of that major). When
Adoptium cannot be reached the list is 25, 21, 17, 8 and `offline` is true.

The registry is the `javaVersions` key of the shared `config.json`
(`[{ version, path, name, isCustom? }]`, one entry per major). Native writes it
through the core config writer, which keeps every other key. A malformed value
fails with `java.registry_invalid` and is never rewritten.

### Install

Managed runtimes live in `<data>/java/jdk-<major>`. Install holds the global
Java runtime lock, resolves the newest GA Temurin JDK for the host OS and CPU,
and refuses packages without a published SHA-256 and size. The archive
(`.tar.gz`, or `.zip` on Windows) streams into the managed root over HTTPS from
the Adoptium/GitHub host allowlist, is hashed while it downloads, and is
extracted into a private staging folder: strict relative entry names only, no
links, capped entry count, depth, total size and compression ratio, and only
execute bits restored. The staging folder then replaces `jdk-<major>` by rename;
the previous install stays as a rollback copy until the registry is saved, and
is restored if saving fails. Reinstalling a major is therefore atomic.

`JavaInstallOperation.progress` is an `AsyncStream<JavaInstallProgress>` with
`bufferingNewest(1)`, attached before the worker starts. Events carry
`operationId`, `phase` (`.download`, `.verify`, `.extract`, `.install`),
`downloaded` and `total` bytes (the archive size; outside `.download` both stay
at the archive size). Await `value()` for the installed runtime. Cancellation is
checked between download chunks, between archive entries, and before the final
swap; a cancelled install leaves no files and no registry entry and fails with
`operation.cancelled`. Dropping the stream does not cancel.

A managed runtime used by a running server cannot be replaced or deleted
(`java.in_use`). Delete moves the folder aside, saves the registry, then removes
it; a managed entry whose folder is already gone is still removed. Deleting a
custom entry only removes the registry entry. Unknown majors succeed.

### Custom runtimes

`addCustomJava(path:)` accepts a java executable or a Java home folder. The
executable must pass the server launch policy: below the managed `java` folder
or a trusted system location (`/Library/Java/JavaVirtualMachines`,
`/usr/lib/jvm`, `/usr/bin/java`, Homebrew, `C:/Program Files/Java`,
`C:/Program Files/Eclipse Adoptium`), never a link. The core then runs
`<java> -version` with a 10 second timeout to read the major, version and
vendor. A custom entry of the same major is replaced; a managed one is kept and
the call fails with `java.duplicate`.

### Required Java

`requiredJava(software:version:)` prefers Mojang's version JSON
(`javaVersion.majorVersion`, cached for the process). Offline or for versions
Mojang does not list it uses the table: up to 1.16.5 → 8, 1.17.x → 16,
1.18–1.20.4 → 17, 1.20.5–1.21.x → 21, 26.1 and later → 25. `source` says which
one answered. Proxies (Velocity, BungeeCord, Waterfall) and snapshots without
Mojang data return nil.

### Java selection per server

The profile's `javaPath` is optional. An unset or empty value selects
Automatic, including for existing profiles. Store `CoreClient.systemJavaSentinel`
(`system`) for System default, which runs `java` from PATH. Any other value is
an explicit Java path and follows the existing launch validation.

Given a required major, Automatic selects an available registered runtime of
that major, then the available runtime with the smallest higher major, then
system Java if it meets the requirement. If none qualify, resolution reports
the missing requirement. Launch still attempts `java` from PATH. With no
requirement, Automatic uses system Java if detected, then the newest available
registered major, then `java` from PATH. On macOS, probing system Java is
guarded by `/usr/libexec/java_home` to avoid triggering the install prompt.

`CoreClient.resolveJava(serverID:)` is asynchronous and throws `CoreError` if
the server cannot be loaded. Its `JavaResolution` has an optional
`requiredMajor` and a `choice`:

| Choice | Associated values |
| --- | --- |
| `.installed` | `path`, `major`, optional `version`, `origin`, and `reason` (`.exact`, `.newerMajor`, or `.newestAvailable`) |
| `.system` | Optional detected `major` |
| `.explicit` | The configured `path` |
| `.systemDefault` | The explicit choice to use `java` from PATH |
| `.missing` | `required` and optional `systemMajor` |

`javaCompatibility(serverID:)` reports `required`, `configuredPath`
(the selected installed or explicit path, nil when launch uses PATH),
`configuredMajor`, `configuredVersion` and `satisfied`
(`configuredMajor >= required.major`, nil when either is unknown). For
Automatic, the major and version describe the Java selected for launch,
including the system fallback. Explicit paths outside the registry are
validated by the launch policy and checked with `-version`.

## Server version and software change

| Operation | Swift API | Result |
| --- | --- | --- |
| Inspect installed version | `CoreClient.serverJarVersionStatus(serverID:)` | `ServerJarVersionStatus` |
| Sync registry version | `CoreClient.syncVersionFromJar(serverID:)` | `ServerJarVersionStatus` |
| Candidates | `CoreClient.serverJarUpgradeCandidates(serverID:targetSoftware:)` | `ServerJarCandidates` |
| Build availability | `CoreClient.serverJarVersionAvailability(software:version:)` | `ServerJarVersionAvailability` |
| Prepare | `CoreClient.prepareServerJarUpgrade(serverID:targetVersion:targetSoftware:allowUnstable:allowDowngrade:)` | `ServerJarUpgradePlan` |
| Execute | `CoreClient.executeServerJarUpgrade(planID:)` | `ServerJarUpgradeOperation` |
| Cancel | `ServerJarUpgradeOperation.cancel()` or `CoreClient.cancelServerJarUpgrade(operationID:)` | `Bool`, whether the ID was active |

Each lookup, sync, and prepare call is `async throws(CoreError)`.
`ServerJarVersionStatus` carries `registeredVersion`, optional
`detectedVersion`, and `mismatch`, which is true when the JAR supplies a version
that differs from the registry. Detection reads bounded metadata entries
inside the managed `server.jar` without extracting it. Sync uses that value
to update the registry version. When detection returns `nil`, sync returns
the current status and leaves the registry version intact. Ordinary settings
saves reject edits to `version` and `software` with `server.version_locked`.

`ServerJarCandidates` carries `serverId`, selected `software`, `currentVersion`,
`supported`, `targetSoftwareCandidates`, and `candidates`. The target
software list starts with the installed software and includes automatically
installable alternatives from its family. Vanilla and proxies only offer
their own software. Pass a listed alternative to load its versions.
`supported` indicates whether MC-Vector can install the selected software
automatically. A resolver can still list versions for informational use,
as with Fabric, whose provider publishes no checksum.

The core uses the detected JAR version for comparisons, with the registry
version as a fallback. Candidates contain the provider's releases other than
`currentVersion`, newest first. Each `ServerJarCandidate` has `version`, `newer`, `latest` (the
provider's newest release), optional `releaseNotesUrl` and optional
`requiredJavaMajor`. Probe the selected release before preparing it.
`ServerJarVersionAvailability` has `.stable`, `.unstable(channel:)` and
`.none(reason:)`. Provider lookup errors throw `CoreError`.

`ServerJarUpgradePlan` carries `planId`, the server, `currentVersion`,
`targetVersion`, target `software`, `downgrade`, `channel`, optional
`softwareChange` with `from` and `to`, the provider `fileName` (installed as
`server.jar`), `size` when published, `checksum` (`algorithm` `sha256` or
`sha1`, lowercase `value`), `verified`, `requiredJava` (Mojang first),
`serverRunning`, `releaseNotesUrl`, and `expiresInSeconds` (300).
The target software defaults to the installed software and the target
version defaults to the newest release with an eligible build. Both opt-in
flags default to `false`. Downgrades require `allowDowngrade`. Prepare
prefers the newest stable build, and `allowUnstable` permits the newest
unstable build when the selected release has no stable build. Prepare rejects
software outside the current family, software without a resolver, and
releases without an eligible build.

Execute consumes the plan once, even when it fails. It refuses plans without a
published checksum (`server_jar.unverified`; the user places such jars by
hand), expired plans (`server_jar.plan_expired`), running servers
(`server.running`: the UI asks the user to stop the server and prepares again),
and profiles whose software or version changed (`server_jar.profile_changed`).
It holds the server's artifact-install lock, downloads the jar over HTTPS from
the official hosts, verifies it while streaming, and swaps it in through the
recovery journal: every stage (prepared, previous jar staged, new jar
installed, registry updated) is persisted before the next file operation.
The registry version and software are updated after the JAR is installed.
Only after a successful swap does the core clean up known bootstrap artifacts
for the previous release, such as `versions/<old>/` and
`cache/mojang_<old>.jar`. Failed and cancelled swaps preserve those paths.
Cleanup is limited to managed paths and preserves worlds, configs, plugins,
mods and libraries. Native recovers interrupted swaps at `start`. A server
that cannot be recovered is marked unavailable and its files are left in place.

`ServerJarUpgradeOperation.progress` is an
`AsyncStream<ServerJarUpgradeProgress>` with `bufferingNewest(1)`. Each event
carries `operationId`, `phase` (`.download`, `.verify`, `.install`),
`downloaded`, and `total` (0 while the size is unknown). Cancellation is
honored during download and verification up to the start of the swap.
`value() async throws(CoreError)` returns `ServerJarUpgradeResult` with
`serverId`, `previousVersion`, `version`, `previousSoftware`, and `software`.

## Errors

Errors cross the boundary as `CoreError { code, message, retryable }` with
local data paths redacted. Java codes: `java.invalid_request`, `java.in_use`,
`java.duplicate`, `java.unsupported_platform`, `java.invalid_executable`,
`java.probe_failed`, `java.archive_invalid`, `java.registry_invalid`,
`java.install_failed`. Upgrade codes: `server_jar.unsupported`,
`server_jar.not_available`, `server_jar.unverified`, `server_jar.plan_expired`,
`server_jar.profile_changed`, `server_jar.install_failed`,
`server_jar.invalid_request`, plus `server.running`, `server.not_found`,
and `server.version_locked`.
Downloads use `download.network_failed`, `download.checksum_mismatch`,
`download.too_large` and `download.unavailable`; cancellation uses
`operation.cancelled`.
