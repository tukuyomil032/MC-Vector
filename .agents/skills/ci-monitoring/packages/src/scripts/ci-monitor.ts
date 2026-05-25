#!/usr/bin/env bun
import chalk from "chalk";
import {
  detectRepo,
  getRunLog,
  listJobs,
  listRuns,
  validateRepo,
  type JobInfo,
  type RunInfo,
} from "../lib/gh.js";
import { pickRun, promptRepo } from "../lib/picker.js";
import { buildJobTable, conclusionBadge, printHeader } from "../lib/tui.js";

const POLL_MS = 10_000;

const args = process.argv.slice(2);
let runId = "";
let repo: string | undefined;
let latestMode = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--repo" && args[i + 1]) repo = args[++i];
  else if (args[i] === "--latest") latestMode = true;
  else if (!args[i].startsWith("-")) runId = args[i];
}

if (!repo) repo = detectRepo() ?? undefined;

if (repo && !(await validateRepo(repo))) {
  console.log(chalk.yellow(`"${repo}" にアクセスできません。別のリポジトリを指定してください。`));
  repo = await promptRepo(repo);
} else if (!repo) {
  repo = await promptRepo();
}

// Run 選択
if (!runId) {
  if (latestMode) {
    const runs = await listRuns({ repo, limit: 1 });
    if (!runs.length) {
      console.error(chalk.red("Run が見つかりません。"));
      process.exit(1);
    }
    runId = String(runs[0].databaseId);
    console.log(chalk.dim(`最新 Run を使用: #${runId}`));
  } else {
    console.log(chalk.dim("Run 一覧を取得中..."));
    const runs = await listRuns({ repo, limit: 20 });
    if (!runs.length) {
      console.error(chalk.red("Run が見つかりません。"));
      process.exit(1);
    }
    const selected = await pickRun(runs);
    runId = String(selected.databaseId);
  }
}

// ジョブ状態を画面更新
function renderJobs(jobs: JobInfo[]): void {
  process.stdout.write("\x1b[2J\x1b[H");
  printHeader(`CI Monitor — Run #${runId}`);
  console.log();
  const { table, passed, failed } = buildJobTable(jobs);
  console.log(table);
  const pending = jobs.filter((j) => !j.conclusion).length;
  console.log(
    `\n  ${chalk.green(`✓ ${passed}`)}  ${chalk.red(`✗ ${failed}`)}  ${chalk.yellow(`⋯ ${pending}`)}`,
  );
  console.log(chalk.dim(`\n  更新: ${new Date().toLocaleTimeString()}  (${POLL_MS / 1000}s ごと)`));
}

// 失敗ログ保存
async function saveFailureReport(jobs: JobInfo[]): Promise<void> {
  const failed = jobs.filter((j) => j.conclusion === "failure");
  if (!failed.length) return;

  const { promptConfirm } = await import("../lib/picker.js");
  const save = await promptConfirm("失敗ログを Markdown ファイルに保存しますか?", false);
  if (!save) return;

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `ci-failure-${runId}-${ts}.md`;
  let md = `# CI 失敗レポート — Run #${runId}\n\n`;
  md += `生成日時: ${new Date().toLocaleString()}\n\n`;
  md += "## 失敗ジョブ\n\n";
  for (const j of failed) {
    md += `- **${j.name}**  (${conclusionBadge(j.conclusion, j.status).replace(/\x1b\[[0-9;]*m/g, "")})\n`;
  }
  try {
    const log = await getRunLog(runId, repo, true);
    md += `\n## ログ抜粋\n\n\`\`\`\n${log.slice(0, 8000)}\n\`\`\`\n`;
  } catch {}
  await Bun.write(path, md);
  console.log(chalk.green(`\n保存完了: ${path}`));
}

// ポーリングループ
let prevConclusion: string | null = null;
let jobs: JobInfo[] = [];

const poll = async (): Promise<boolean> => {
  try {
    jobs = await listJobs(runId, repo);
  } catch {
    return false;
  }
  renderJobs(jobs);

  const allDone = jobs.every((j) => j.conclusion);
  if (!allDone) return false;

  // Run 全体の conclusion を確認
  const runs = await listRuns({ repo, limit: 50 });
  const run = runs.find((r) => String(r.databaseId) === runId);
  const conclusion = run?.conclusion ?? null;

  if (conclusion !== prevConclusion) {
    prevConclusion = conclusion;
    if (conclusion === "success") {
      console.log(chalk.green.bold("\n✓ CI 成功"));
    } else if (conclusion === "failure") {
      console.log(chalk.red.bold("\n✗ CI 失敗"));
      await saveFailureReport(jobs);
    }
  }
  return true;
};

const done = await poll();
if (!done) {
  const timer = setInterval(async () => {
    const finished = await poll();
    if (finished) clearInterval(timer);
  }, POLL_MS);
}
