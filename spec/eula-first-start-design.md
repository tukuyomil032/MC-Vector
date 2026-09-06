# EULA First-Start Design

## Goal

Starting a newly created, imported, or existing Minecraft server must not fail once
only because the server generated `eula.txt` with `eula=false`. The first manual
start request pauses for an explicit consent decision and then continues the same
start request after writing the server's EULA file.

## Scope and source of truth

- EULA acceptance is stored per server in that server's managed `eula.txt` file.
- Server creation does not create `eula.txt`; the file is created when the user
  accepts the first-start prompt.
- The official EULA link is
  [Minecraft EULA](https://www.minecraft.net/en-us/eula).
- The renderer performs a preflight check, but Rust performs the authoritative
  check immediately before Java process creation.

## Rust contract

The server-management command module owns two IPC commands:

```ts
type ServerEulaStatus = {
  accepted: boolean;
  fileExists: boolean;
};

get_server_eula_status({ serverId }): Promise<ServerEulaStatus>;
accept_server_eula({ serverId }): Promise<void>;
```

`src-tauri/src/commands/eula.rs` resolves the server directory through the
existing managed-path validator. It never accepts an absolute path from IPC.
Only active `eula=` assignments are parsed; blank lines and comment lines are
ignored. Acceptance requires at least one active assignment and every active
assignment to have a value equal to `true` after trimming, case-insensitively.

Accepting an EULA updates every active assignment to `true`, preserves comments,
other settings, and LF/CRLF line endings, and appends `eula=true` when no active
assignment exists. Read and write failures are returned to the caller. The
shared helper is also called by `start_server`; `eula-required` is returned and
Java is not spawned when the file is missing or not accepted.

## Renderer flow

`use-server-eula-gate.ts` coalesces requests by server ID and exposes two modes:

- `interactive`: opens `ServerEulaModal`, waits for the checkbox and consent,
  and returns `accepted` or `cancelled`.
- `background`: never opens a modal and returns `blocked` for an unaccepted EULA.

Manual start and restart use `interactive`. Bulk start handles each server in
order, skips a cancelled server, and continues with the remaining servers.
Automatic crash restart uses `background`; it leaves the server offline for that
attempt, preserves `autoRestartOnCrash`, and shows a server-specific instruction
to accept the EULA and start manually.

The modal keeps the consent checkbox unchecked initially, disables the consent
button until checked, opens the official link through `openUrl`, prevents double
submission, and keeps the dialog open with an inline error when writing fails.

## Verification strategy

- Rust unit tests cover missing files, invalid values, comments, whitespace and
  case normalization, multiple assignments, comment/newline preservation, file
  append behavior, and read/write failures.
- Renderer tests cover accepted, interactive, cancelled, duplicate, write-error,
  and background gate behavior plus the checkbox contract.
- E2E runtime mocks enforce the same EULA defense, seed accepted EULAs for normal
  existing-server scenarios, and leave newly created servers without an EULA file.
- E2E lifecycle coverage verifies first-start consent, cancellation and retry,
  single `start_server` execution, runtime file creation, and accepted-server
  startup without a modal.
