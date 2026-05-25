#!/usr/bin/env bun
import chalk from "chalk";
import { appendFile } from "node:fs/promises";
import { detectRepo, getRunLog, listJobs, listRuns, validateRepo } from "../lib/gh.ts";
import { pickRun, promptRepo } from "../lib/picker.ts";

const args = process.argv.slice(2);
let runId = "";
let repo: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--repo" && args[i + 1]) repo = args[++i];
  else if (!args[i].startsWith("-")) runId = args[i];
}

if (!repo) repo = detectRepo() ?? undefined;

if (repo && !(await validateRepo(repo))) {
  console.log(chalk.yellow(`"${repo}" にアクセスできません。別のリポジトリを指定してください。`));
  repo = await promptRepo(repo);
} else if (!repo) {
  repo = await promptRepo();
}

if (!runId) {
  // CI 環境では GITHUB_RUN_ID を自動取得
  runId = Bun.env.GITHUB_RUN_ID ?? "";
  if (!runId) {
    console.log(chalk.dim("Run 一覧を取得中..."));
    const runs = await listRuns({ repo, limit: 20 });
    if (!runs.length) {
      console.error(chalk.red("Run が見つかりませんでした。"));
      process.exit(1);
    }
    const selected = await pickRun(runs, { message: "サマリーを生成する Run を選択" });
    runId = String(selected.databaseId);
  }
}

const jobs = await listJobs(runId, repo);
const passed = jobs.filter((j) => j.conclusion === "success").length;
const failed = jobs.filter((j) => j.conclusion === "failure").length;
const total = jobs.length;

let md = `## CI 結果サマリー — Run #${runId}\n\n`;
md += `| 結果 | 件数 |\n|------|------|\n`;
md += `| ✓ 成功 | ${passed} |\n`;
if (failed) md += `| ✗ 失敗 | ${failed} |\n`;
md += `| 合計 | ${total} |\n\n`;

md += `### ジョブ一覧\n\n| ジョブ | ステータス | 時間 |\n|--------|-----------|------|\n`;

for (const job of jobs) {
  const badge = job.conclusion === "success" ? "✓" : job.conclusion === "failure" ? "✗" : "⋯";
  let duration = "—";
  if (job.startedAt && job.completedAt) {
    const diff = Math.floor(
      (new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000,
    );
    duration = `${Math.floor(diff / 60)}m ${diff % 60}s`;
  }
  md += `| ${job.name} | ${badge} ${job.conclusion ?? job.status} | ${duration} |\n`;
}

if (failed > 0) {
  try {
    const log = await getRunLog(runId, repo, true);
    const excerpt = log.split("\n").slice(0, 50).join("\n");
    md += `\n### 失敗ログ (抜粋)\n\n\`\`\`\n${excerpt}\n\`\`\`\n`;
  } catch {}
}

const summaryPath = Bun.env.GITHUB_STEP_SUMMARY;
const isLocal = !summaryPath;

if (isLocal) {
  const localPath = `./ci-summary-${runId}.md`;
  await Bun.write(localPath, md);
  console.log(chalk.green(`CI サマリーを ${localPath} に保存しました。`));
  console.log(chalk.dim("\n--- サマリー内容 ---\n"));
  console.log(md);
} else {
  await appendFile(summaryPath, md, "utf-8");
  console.log(`CI サマリーを ${summaryPath} に書き込みました。`);
}
