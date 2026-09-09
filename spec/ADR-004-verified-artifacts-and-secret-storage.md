# ADR-004: Verified Artifacts and Secret Storage

- Status: Proposed
- Date: 2026-09-09
- Scope: Server JARs, Java runtimes, ngrok binaries, and ngrok credentials
- Depends on: ADR-001

## Context

MC-Vector downloads and executes server JARs, Java runtimes, and an ngrok binary. Some provider paths can return a URL without a mandatory digest. A URL that looks official is not proof that the received bytes are authentic or complete.

The ngrok token is currently stored in the renderer's Tauri Store and can be displayed as a normal text input. This exposes a long-lived credential to the renderer state, local configuration, logs, and accidental UI capture.

## Current Failure Modes

| Current behavior | Why it fails | Required proof |
| --- | --- | --- |
| Server JAR checksum is optional for some providers | A changed or corrupted executable can be installed and run | Missing/wrong hash rejection test |
| Java and ngrok use separate download paths | One path can bypass verification rules added to another | Shared pipeline test |
| Partial downloads can approach an executable destination | A failure can leave a misleading or runnable partial artifact | Cleanup test |
| ngrok token is stored in `config.json` | Any renderer or local config reader can obtain the credential | Legacy migration and absence test |
| `start_ngrok` receives the token from the renderer | The secret crosses the IPC boundary unnecessarily | Token-never-returned test |

## Decision: verified artifacts

Every executable or installable external artifact uses a common verified-artifact contract.

```ts
type VerifiedArtifact = {
  artifactId: string;
  provider: string;
  name: string;
  version: string;
  platform: string;
  url: string;
  size: number;
  sha256: string;
  signature?: {
    algorithm: string;
    value: string;
    keyId: string;
  };
};
```

The Rust install API rejects missing or invalid SHA-256 values.

```rust
pub async fn install_verified_artifact(
    artifact: VerifiedArtifactRequest,
) -> Result<InstalledArtifact, AppError>;
```

The following failures stop installation:

- missing digest
- malformed digest
- response size mismatch
- SHA-256 mismatch
- signature mismatch when a signature is declared
- truncated response
- unsafe redirect or unapproved provider origin

The temporary download is stored in a unique sibling file. It becomes an executable artifact only after verification and a successful atomic install.

## Provider policy

Provider adapters must return version, platform, expected size, URL, and SHA-256. If a provider cannot provide an independently supplied digest, MC-Vector blocks the install and explains that the artifact cannot be safely verified.

This policy applies to:

- Vanilla server JAR
- Fabric server JAR
- Paper / Leaf server JAR
- Java runtime
- ngrok binary

The existing plugin download policy may remain compatible with its current supported checksum algorithms, but executable installation must require SHA-256.

## Decision: secret storage

Use an OS credential store abstraction. There is no plaintext fallback.

```rust
pub trait SecretStore {
    fn get(&self, key: &str) -> Result<Option<String>, AppError>;
    fn set(&self, key: &str, value: &str) -> Result<(), AppError>;
    fn delete(&self, key: &str) -> Result<(), AppError>;
}
```

Backends:

- macOS Keychain
- Windows Credential Manager
- Linux Secret Service when supported

The renderer receives only status.

```ts
type NgrokTokenStatus = {
  configured: boolean;
  lastUpdatedAt?: string;
};

getNgrokTokenStatus(): Promise<NgrokTokenStatus>;
setNgrokToken(token: string): Promise<void>;
clearNgrokToken(): Promise<void>;
startNgrok(request: StartNgrokRequest): Promise<NgrokProcessInfo>;
```

`startNgrok` reads the token in Rust and passes it to the child process without returning it to the renderer.

## Legacy migration

The old Tauri Store token is migrated once:

1. Read only the legacy key through Rust.
2. Write it to the OS credential store.
3. Verify that the credential-store write succeeded.
4. Delete the legacy key.
5. Log only the migration result, never the value.

If the credential-store write fails, retain the legacy value only long enough to show a migration failure and never start ngrok with an unverified migration. The UI provides a password input:

```tsx
<input type="password" autoComplete="new-password" />
```

## Redaction

The token must not appear in renderer state, console output, Rust logs, event payloads, error messages, telemetry, or command-line arguments. Any diagnostic logger used around ngrok must redact known secret values before formatting.

## Implementation Plan

- Add the common verified-artifact request and result types.
- Make JAR, Java, and ngrok installers use the shared verification helper.
- Remove hashless install fallback for executable artifacts.
- Add the OS credential-store dependency and managed state.
- Replace token-valued frontend APIs with status-only APIs.
- Add one-time legacy migration and delete the old Store key after success.
- Update ngrok start/stop commands and UI.

## Verification Plan

```bash
cargo test --quiet
pnpm test
pnpm build
```

Add tests for missing/wrong hashes, partial download cleanup, preserving an old artifact after replacement failure, token migration, token absence from logs, and renderer status-only behavior.

## Exit Criteria

- Hashless server JAR, Java, and ngrok installation is impossible.
- A checksum mismatch leaves no partial executable.
- Existing artifacts survive replacement failure.
- The token is absent from `config.json` after migration.
- The renderer never receives the token value.
- Keychain / Credential Manager-backed start works on the available target OS.
