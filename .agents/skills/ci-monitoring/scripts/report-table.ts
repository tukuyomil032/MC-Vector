#!/usr/bin/env bun
import chalk from "chalk";
import { detectRepo, listJobs, listRuns, validateRepo } from "../lib/gh.ts";
import { pickRun, promptRepo } from "../lib/picker.ts";
import { buildJobTable, printHeader } from "../lib/tui.ts";

const args = process.argv.slice(2);
let runId = "";
let repo: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--repo" && args[i + 1]) {
    repo = args[++i];
  } else if (!args[i].startsWith("-")) {
    runId = args[i];
  }
}

if (!repo) repo = detectRepo() ?? undefined;

if (repo && !(await validateRepo(repo))) {
  console.log(chalk.yellow(`"${repo}" にアクセスできません。別のリポジトリを指定してください。`));
  repo = await promptRepo(repo);
} else if (!repo) {
  repo = await promptRepo();
}

if (!runId) {
  console.log(chalk.dim("Run 一覧を取得中..."));
  const runs = await listRuns({ repo, limit: 20 });
  if (!runs.length) {
    console.error(chalk.red("Run が見つかりませんでした。"));
    process.exit(1);
  }
  const selected = await pickRun(runs);
  runId = String(selected.databaseId);
}

console.log(chalk.dim(`ジョブ情報を取得中... (Run #${runId})`));
const jobs = await listJobs(runId, repo);

printHeader(`CI Jobs — Run #${runId}`);
console.log();

const { table, passed, failed } = buildJobTable(jobs);
console.log(table);

if (failed > 0) {
  console.log(chalk.red.bold(`\n✗ ${failed} ジョブ失敗 / ${passed + failed} ジョブ`));
} else {
  console.log(chalk.green.bold(`\n✓ 全 ${passed} ジョブ成功`));
}
console.log();
