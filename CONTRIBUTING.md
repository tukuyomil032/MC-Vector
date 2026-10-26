# Contributing to MC-Vector

Thanks for your interest in improving MC-Vector. This guide explains how to set up the project, follow its conventions, and prepare a reviewable pull request.

## Ways to contribute

- **Bug reports** — open an issue with reproduction steps and environment details.
- **Feature requests** — describe the use case and expected behavior before starting a broad implementation.
- **Pull requests** — submit focused fixes, features, tests, documentation, or maintenance changes.

## Before you start

- Check open issues and pull requests to avoid duplicate work.
- For behavior changes, new integrations, or dependency updates, discuss the approach before investing in a large implementation.
- Keep each pull request focused on one coherent problem. Split unrelated fixes into separate pull requests.
- Never include secrets, tokens, private server data, or generated application data in a commit.

## Development setup

### Requirements

- Node.js 20.19+ or 22.12+ (Node.js 22 is recommended)
- Bun 1.4.2
- Rust 1.77.2 or later
- The platform dependencies required by Tauri

### Install and run

1. Clone the repository and enter it:
   ```bash
   git clone https://github.com/tukuyomil032/MC-Vector.git
   cd MC-Vector
   ```
2. Install JavaScript dependencies:
   ```bash
   bun install
   ```
3. Start the application during development:
   ```bash
   bun run tauri:dev
   ```

For manual QA of the packaged debug application, build a debug bundle instead of using the development server:

```bash
bun run tauri:build:debug
```

Development builds use the isolated bundle identifier `com.tukuyomi032.mcvector.debug`
and product name `MC-Vector Debug`, so their macOS application data and OS permissions
do not overlap with the release app.

## Project conventions

### Branch naming

Use a type prefix followed by a short kebab-case description:

- `feat/` — new features
- `fix/` — bug fixes
- `ref/` — refactors
- `test/` — test-only changes
- `docs/` — documentation-only changes
- `chore/` — maintenance and dependency work

Examples:

```text
fix/server-jar-download
feat/plugin-filter
docs/contribution-guide
```

Avoid unrelated renames or directory reshuffles in the same pull request.

### Commit messages

Use an English prefix and a concise imperative summary:

```text
fix: prevent stalled plugin searches
feat: add server import validation
ref: extract file editor workspace
docs: document local validation commands
```

Prefer one commit per logical task. Do not add a `Co-Authored-By` trailer unless the project maintainer explicitly requests one.

Release notes are generated from commits since the previous published release. Use these prefixes so each change lands in the right section:

- `feat` — Features
- `fix` — Bug Fixes
- `perf` — Performance
- `type!` or a `BREAKING CHANGE` footer — Breaking Changes
- `chore`, `docs`, `ci`, `test`, `build`, `style`, and `ref` — Maintenance
- Other commit types — Other Changes

Merge commits and release preparation commits are omitted from the generated notes.

## Release process

To prepare a release, authenticate the [GitHub CLI](https://cli.github.com/) with `gh auth login`, then run `just release` and enter the exact target version as `X.Y.Z`, `X.Y.Z-beta.N`, or a `v`-prefixed version. The command dispatches the **Prepare Release PR** workflow on `main`. The workflow validates version progression and duplicate tags, updates the synchronized version files, generates the next `CHANGELOG.md` entry, and opens a pull request for review.

For a beta release, the changelog entry covers commits since the previous beta in the same version series, or since the latest stable release for `.beta.1`. Beta releases are published as GitHub prereleases. The next stable release uses the latest published stable tag as its changelog base, so its entry includes all changes since that stable release, including changes already listed in beta entries. Beta changelog entries remain in the history.

Review the generated changelog and version changes in the pull request, then merge it. The **Release** workflow builds the installers, creates a GitHub Release, and updates the signed updater feeds. Beta releases update the beta feeds; stable releases update the stable feeds and advance the beta feeds when the stable version is newer. The legacy `latest.json` feed remains stable-only for older app versions.

Users can choose **Stable** or **Beta** in Application Settings. Stable is the default, and the choice persists across updates. An app version without the channel selector needs a one-time manual installation of the first beta; subsequent beta updates use the in-app updater. Switching back to Stable does not downgrade a newer beta installation.

### Coding guidelines

- Keep TypeScript changes compatible with the existing strict configuration.
- Run Oxlint and Oxfmt through the project scripts rather than hand-formatting large unrelated areas.
- Keep Tauri commands and their frontend wrappers aligned; update capability allowlists when adding IPC commands.
- Never swallow errors silently. Preserve actionable context for users and logs.
- Add or update tests for behavior changes and regression fixes.
- Keep UI changes accessible: provide labels for icon-only controls, visible focus states, and keyboard-accessible actions.
- Avoid introducing third-party download sources or untrusted installers when an official source is available.

## Validation

### Migrating from Biome to Oxlint and Oxfmt

When migrating another checkout or updating the project toolchain, use the following order:

```bash
bun add -d oxlint oxfmt
bunx --no-install oxfmt --migrate=biome
# Review .oxlintrc.json and map the existing lint rules and plugins manually.
# Update package scripts, Lefthook, CI workflows, and documentation.
bun run fmt
bun run lint
bun run rustfmt:check
bun run test
bun run build
```

Oxfmt can migrate formatter settings from Biome, but lint rules and plugins must be reviewed manually because Oxlint and Biome do not share the same configuration format. Remove the old Biome configuration and dependency only after the new checks pass.

The repository uses Bun `1.4.2` as its package manager and workspace runner. Keep the root `package.json` workspace definition and `bun.lock` synchronized when changing dependencies.

Before opening a pull request, run the checks relevant to the change. For a full local validation:

```bash
bun run check
bun run rustfmt:check
bun run test
bun run build
(cd src-tauri && cargo test)
git diff --check
```

For UI changes, also perform manual verification in the packaged debug application when possible:

```bash
bun run tauri:build:debug
```

Record manual test steps, platform details, and any known limitations in the pull request description.

## Pull request expectations

Use the pull request template and keep these sections complete:

- **Problem** — what is broken or missing and why it matters.
- **Solution** — the important changes and their rationale.
- **Scope** — what is included and what is explicitly out of scope.
- **Validation** — automated checks and manual QA performed.

For UI or desktop behavior changes, include screenshots or a short description of the packaged-app verification when useful.

## Reporting bugs

Include:

- Steps to reproduce
- Expected behavior
- Actual behavior
- MC-Vector version or commit
- Operating system and version
- Relevant logs or screenshots with secrets removed

## Security issues

Do not report vulnerabilities or exposed credentials in a public issue. Contact the maintainer privately with enough detail to reproduce and assess the issue.
