---
name: ci-monitoring
description: Monitor GitHub Actions CI/CD workflows after git push. ALWAYS invoke this skill automatically immediately after any successful `git push` command — do not wait for the user to ask. Also invoke when the user says "monitor CI", "check if CI passed", "watch the workflow", "CI の結果を確認", "ワークフローを監視", or provides a GitHub Actions URL. This skill is essential: after pushing code, Claude must verify CI results proactively so the user never has to manually check GitHub.
---

# CI Monitoring

After `git push`, automatically monitor GitHub Actions until the workflow completes or fails, then report results to the user.

## Core Principle

Never leave the user wondering if CI passed. The moment a push succeeds, start monitoring. Don't ask permission — just do it and report.

## Step-by-Step Workflow

All monitoring is handled by the scripts in `.agents/skills/ci-monitoring/scripts/`.
Call them directly — do not re-implement the logic inline.

### 1. Interactive mode (default)

```bash
bash .agents/skills/ci-monitoring/scripts/ci-monitor.sh
```

This opens an fzf browser of recent runs. If fzf is not installed, falls back to a `select` menu.

### 2. With a specific Run ID

```bash
bash .agents/skills/ci-monitoring/scripts/ci-monitor.sh <run-id>
```

### 3. Non-interactive — show latest run immediately

```bash
bash .agents/skills/ci-monitoring/scripts/ci-monitor.sh --latest
```

### 4. On Success

`ci-monitor.sh` exits 0. Report concisely:

```
✓ CI passed — all jobs green. (Run #XXXXX, Ys)
```

### 5. On Failure

`ci-monitor.sh` automatically invokes `analyze-failure.sh` and displays a categorized error table.
It then prompts interactively whether to:
1. Save a Markdown report to `.claude/ci-reports/`
2. Append the failure pattern to `SKILL.md`

You can also pipe logs directly to the analyzer:

```bash
gh run view <id> --log-failed | bash .agents/skills/ci-monitoring/scripts/analyze-failure.sh --stdin
```

## Key Commands Reference

| Purpose | Command |
|---------|---------|
| List recent runs | `gh run list --repo owner/repo --limit 5` |
| Watch until done | `gh run watch <id> --repo owner/repo --exit-status` |
| View status | `gh run view <id> --repo owner/repo` |
| Failed job logs | `gh run view <id> --repo owner/repo --log-failed` |
| All logs | `gh run view <id> --log --repo owner/repo 2>&1` |
| Specific job logs | `gh api repos/owner/repo/actions/jobs/<job-id>/logs` |
| Job IDs for a run | `gh run view <id> --repo owner/repo --json jobs --jq '.jobs[].databaseId'` |

## Reporting Format

**Success:**
```
✓ CI passed — 19/19 tests passing (ubuntu-latest + windows-latest)
  Run #XXXXX · Ys · feat/branch
```

**Failure:**
```
✗ CI failed — ubuntu-latest job
  Job: "Run E2E tests" (step 12)
  Error: ElementNotInteractableError at navigation.test.js:48
  → [paste relevant log lines]
  
Possible cause: [your analysis]
```

## Scripts (Interactive Mode)

When the skill is installed in a project, richer tooling lives at `.agents/skills/ci-monitoring/scripts/`:

| Script | Purpose |
|--------|---------|
| `ci-monitor.sh` | fzf interactive job browser with failure analysis |
| `analyze-failure.sh` | Error extraction + category classification (Rust/Test/Package/Network/Lint) |
| `report-table.sh` | ANSI color table of all jobs with status + duration |
| `gha-summary.sh` | Write results to GitHub Actions Job Summary (CI env only) |

**Usage:**
```bash
# Interactive fzf browser (requires fzf + jq)
bash .agents/skills/ci-monitoring/scripts/ci-monitor.sh

# Direct run ID
bash .agents/skills/ci-monitoring/scripts/ci-monitor.sh <run-id>

# Non-interactive: show latest run immediately
bash .agents/skills/ci-monitoring/scripts/ci-monitor.sh --latest

# Pipe log to analyzer
gh run view <id> --log-failed | bash .agents/skills/ci-monitoring/scripts/analyze-failure.sh --stdin
```

After a failure, `ci-monitor.sh` prompts whether to:
1. Save a Markdown report to `.claude/ci-reports/`
2. Append the failure pattern to `SKILL.md` for future reference
