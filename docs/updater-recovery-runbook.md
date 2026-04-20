# Updater Signature Recovery Runbook

## Purpose

This runbook is for recovering from Tauri updater failures where download completes but install fails with `Signature verification failed`.

It follows Tauri v2 updater guidance and the current MC-Vector release workflow.

## Confirmed constraints for this repository

- Old updater signing private key is **lost**.
- Existing installed clients signed with the old key cannot auto-migrate to the new key.
- A one-time **manual reinstall** is required for legacy clients.

## Phase 1: Regenerate updater signing keypair (manual)

```bash
pnpm tauri signer generate -w ~/.tauri/mc-vector.key
```

Store these securely:

1. `~/.tauri/mc-vector.key` (private key)
2. key password
3. `~/.tauri/mc-vector.key.pub` (public key, can be shared)

## Phase 2: Update updater pubkey in app config

1. Copy public key content:

```bash
cat ~/.tauri/mc-vector.key.pub
```

2. Set the exact value in:
   - `src-tauri/tauri.conf.json`
   - `plugins.updater.pubkey`

3. Confirm updater artifacts are enabled:
   - `bundle.createUpdaterArtifacts` is `true`

## Phase 3: Rotate GitHub Secrets (manual)

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/mc-vector.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

If macOS signing/notarization is used, verify Apple secrets too:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`
- `KEYCHAIN_PASSWORD`

## Phase 4: Local preflight check (manual)

```bash
pnpm check && pnpm build
```

Optional local signed build:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/mc-vector.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<your-password>"
pnpm tauri build
```

Expected updater artifacts:

- macOS: `*.app.tar.gz` and `*.app.tar.gz.sig`
- Windows: `*-setup.exe` and `*-setup.exe.sig`

This repository currently uses `bundle.createUpdaterArtifacts: true` in `src-tauri/tauri.conf.json`, so Windows updater artifacts are expected as `setup.exe` + `.sig`.
If you switch to `bundle.createUpdaterArtifacts: "v1Compatible"`, align the workflow and docs with the legacy zip-style updater artifacts.

## Phase 5: CI release execution and validation

Push branch and run release workflow.  
The workflow must:

1. Build and sign release artifacts.
2. Generate `latest.json` from normalized assets.
3. Publish GitHub Release artifacts first.
4. Verify URLs in `latest.json` are reachable.
5. Deploy `latest.json` to `gh-pages`.

## Phase 6: Post-release verification (manual)

Check manifest:

```bash
curl -fsSL https://tukuyomil032.github.io/MC-Vector/latest.json | jq .
```

Check URLs:

```bash
curl -fsSL https://tukuyomil032.github.io/MC-Vector/latest.json \
  | jq -r '.platforms | to_entries[] | .value.url' \
  | while read -r u; do
      if curl -fsIL "$u" >/dev/null; then
        echo "OK $u"
      else
        echo "NG $u" >&2
        exit 1
      fi
    done
```

## Legacy-client migration notice (required)

Because the old key is lost, publish this guidance in release notes and docs:

1. If updater fails with signature verification, uninstall old app.
2. Download latest installer manually from GitHub Releases.
3. Install and launch once.
4. Future updates will work with the new key.

## Suggested commit slicing

1. `fix: reorder updater publish sequence`
2. `fix: add updater manifest and URL validation gates`
3. `docs: add updater signature recovery runbook`
4. `ref: improve updater signature failure messaging` (if UI copy is updated)

Use multi-line commit messages:

```bash
git commit -m "fix: reorder updater publish sequence" \
  -m "Publish GitHub release assets before deploying latest.json to gh-pages" \
  -m "Prevents manifest/asset race that can cause signature verification failures"
```
