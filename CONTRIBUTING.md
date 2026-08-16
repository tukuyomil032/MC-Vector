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

- Node.js 18 or later (Node.js 22 is recommended)
- pnpm 10.26.2 or later
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
   pnpm install
   ```
3. Start the application during development:
   ```bash
   pnpm tauri:dev
   ```

For manual QA of the packaged debug application, build a debug bundle instead of using the development server:

```bash
pnpm exec tauri build --debug
```

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

### Coding guidelines

- Keep TypeScript changes compatible with the existing strict configuration.
- Run Biome through the project scripts rather than hand-formatting large unrelated areas.
- Keep Tauri commands and their frontend wrappers aligned; update capability allowlists when adding IPC commands.
- Never swallow errors silently. Preserve actionable context for users and logs.
- Add or update tests for behavior changes and regression fixes.
- Keep UI changes accessible: provide labels for icon-only controls, visible focus states, and keyboard-accessible actions.
- Avoid introducing third-party download sources or untrusted installers when an official source is available.

## Validation

Before opening a pull request, run the checks relevant to the change. For a full local validation:

```bash
pnpm check
pnpm test
pnpm build
(cd src-tauri && cargo test)
git diff --check
```

For UI changes, also perform manual verification in the packaged debug application when possible:

```bash
pnpm exec tauri build --debug
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
