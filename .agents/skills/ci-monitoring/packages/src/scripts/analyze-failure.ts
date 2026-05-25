#!/usr/bin/env bun
import chalk from "chalk";
import type { ChalkInstance } from "chalk";
import { detectRepo, getRunLog, listRuns, validateRepo } from "../lib/gh.js";
import { pickRun, promptRepo } from "../lib/picker.js";
import { printHeader, printSection } from "../lib/tui.js";

const PATTERNS: Array<{ label: string; re: RegExp; color: ChalkInstance }> = [
  { label: "Rust Compile", re: /error\[E\d+\]|^error: |-->.*\.rs:/m, color: chalk.red },
  {
    label: "Build Tool",
    re: /cargo.*error|vite.*error|tsc.*error|TypeScript error/im,
    color: chalk.red,
  },
  {
    label: "Test Failure",
    re: /FAILED.*test|test.*FAILED|assertion.*failed|AssertionError|panicked at/im,
    color: chalk.red,
  },
  {
    label: "Package Error",
    re: /npm ERR!|pnpm ERR!|ELIFECYCLE|Cannot find module/im,
    color: chalk.yellow,
  },
  {
    label: "Lint / Format",
    re: /oxlint|eslint.*error|biome.*error|clippy.*error/im,
    color: chalk.magenta,
  },
  {
    label: "Network Error",
    re: /Connection refused|ECONNREFUSED|ETIMEDOUT|dial tcp.*timeout/im,
    color: chalk.cyan,
  },
  { label: "Permission", re: /EACCES|Permission denied|access denied/im, color: chalk.yellow },
];

const FILE_REF = /[\w/.-]+\.(rs|ts|tsx|js|jsx|toml|yaml|yml):\d+/g;

const args = process.argv.slice(2);
let runId = "";
let repo: string | undefined;
let stdinMode = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--stdin") {
    stdinMode = true;
  } else if (args[i] === "--repo" && args[i + 1]) {
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

let log: string;

if (stdinMode) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Uint8Array);
  log = Buffer.concat(chunks).toString("utf-8");
} else {
  if (!runId) {
    console.log(chalk.dim("失敗した Run 一覧を取得中..."));
    const runs = await listRuns({ repo, limit: 15, status: "failure" });
    if (!runs.length) {
      console.log(chalk.yellow("失敗した Run が見つかりませんでした。"));
      process.exit(0);
    }
    const selected = await pickRun(runs, { message: "分析する Run を選択" });
    runId = String(selected.databaseId);
  }

  console.log(chalk.dim("ログを取得中..."));
  try {
    log = await getRunLog(runId, repo, true);
  } catch {
    log = await getRunLog(runId, repo, false);
  }
}

if (!log.trim()) {
  console.error(chalk.yellow("ログが空または取得できませんでした。"));
  process.exit(1);
}

printHeader(`CI 失敗分析レポート${runId ? `  (Run #${runId})` : ""}`);
console.log();

let foundAny = false;

for (const { label, re, color } of PATTERNS) {
  const lines = log
    .split("\n")
    .filter((l) => re.test(l))
    .slice(0, 5);
  if (!lines.length) continue;

  foundAny = true;
  printSection(label, color);

  const refs = lines.flatMap((l) => [...l.matchAll(FILE_REF)].map((m) => m[0])).slice(0, 3);
  if (refs.length) {
    console.log(chalk.dim("  参照箇所:"));
    for (const r of refs) console.log(chalk.cyan(`    → ${r}`));
    console.log();
  }

  console.log(chalk.dim("  エラー行:"));
  for (const l of lines) console.log(color(`    ${l}`));
  console.log();
}

if (!foundAny) {
  console.log(chalk.yellow("既知のエラーパターンにマッチする行が見つかりませんでした。\n"));
  console.log(chalk.dim("最後の 20 行:"));
  const tail = log.trim().split("\n").slice(-20);
  for (const l of tail) console.log(chalk.dim(`  ${l}`));
}

console.log(chalk.dim("─".repeat(60)));
console.log(chalk.dim("  ヒント: 詳細ログは gh run view <id> --log-failed で確認\n"));
