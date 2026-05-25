#!/usr/bin/env bun
import chalk from "chalk";
import { detectRepo, listWorkflows, localBranches, triggerWorkflow } from "../lib/gh.ts";
import { pickBranch, pickWorkflow, promptConfirm, promptInput } from "../lib/picker.ts";
import { printHeader } from "../lib/tui.ts";

interface DispatchInput {
  description: string;
  default: string;
  required: boolean;
  type: string;
}

function parseDispatchInputs(yaml: string): Record<string, DispatchInput> {
  const inputs: Record<string, DispatchInput> = {};
  const lines = yaml.split("\n");
  let inDispatch = false;
  let inInputs = false;
  let dispatchIndent = -1;
  let inputsIndent = -1;
  let currentKey = "";

  for (const line of lines) {
    const stripped = line.trimStart();
    const indent = line.length - stripped.length;

    if (/^on\s*:/.test(line)) {
      inDispatch = false;
      inInputs = false;
    }

    if (!inDispatch && stripped.includes("workflow_dispatch") && !stripped.startsWith("#")) {
      inDispatch = true;
      dispatchIndent = indent;
      continue;
    }
    if (inDispatch && !inInputs && stripped.startsWith("inputs:")) {
      inInputs = true;
      inputsIndent = indent;
      continue;
    }
    if (inInputs) {
      if (indent <= dispatchIndent && stripped && !stripped.startsWith("#")) break;
      if (indent === inputsIndent + 2 && stripped && !stripped.startsWith("#")) {
        currentKey = stripped.replace(/:$/, "");
        inputs[currentKey] = { description: "", default: "", required: false, type: "string" };
      } else if (currentKey && indent > inputsIndent + 2) {
        const m = stripped.match(/^(\w+)\s*:\s*(.*)/);
        if (m && m[1] in inputs[currentKey]) {
          (inputs[currentKey] as unknown as Record<string, string | boolean>)[m[1]] =
            m[1] === "required" ? m[2].trim() === "true" : m[2].trim().replace(/^['"]|['"]$/g, "");
        }
      }
    }
  }
  return inputs;
}

const args = process.argv.slice(2);
let repoArg: string | undefined;
let noConfirm = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--repo" && args[i + 1]) repoArg = args[++i];
  if (args[i] === "--no-confirm") noConfirm = true;
}

const repo = repoArg ?? detectRepo();
if (!repo) {
  console.error(chalk.red("リポジトリを検出できませんでした。--repo を指定してください。"));
  process.exit(1);
}

printHeader("GitHub Actions ワークフロートリガー");
console.log(chalk.dim(`  Repo: ${chalk.bold(repo)}\n`));

console.log(chalk.dim("ワークフロー一覧を取得中..."));
const workflows = await listWorkflows(repo);
if (!workflows.length) {
  console.error(chalk.red("アクティブなワークフローが見つかりません。"));
  process.exit(1);
}

const selectedWf = await pickWorkflow(workflows);
const wfFile = selectedWf.path.split("/").at(-1)!;
console.log(chalk.dim(`  選択: ${chalk.bold(wfFile)}\n`));

const branches = localBranches();
const selectedBranch = await pickBranch(branches.length ? branches : ["main"]);
console.log(chalk.dim(`  選択: ${chalk.bold(selectedBranch)}\n`));

// workflow_dispatch inputs パース
const fields: Record<string, string> = {};
const localWfPath = `.github/workflows/${wfFile}`;
const wfFile$ = Bun.file(localWfPath);

if (await wfFile$.exists()) {
  const yaml = await wfFile$.text();
  if (!yaml.includes("workflow_dispatch")) {
    console.log(chalk.yellow("  ⚠ このワークフローに workflow_dispatch トリガーがありません。\n"));
  } else {
    const dispatchInputs = parseDispatchInputs(yaml);
    if (Object.keys(dispatchInputs).length) {
      console.log(chalk.cyan("── ワークフロー入力を設定 ──────────────────────────\n"));
      for (const [key, info] of Object.entries(dispatchInputs)) {
        let msg = info.description || key;
        if (info.default) msg += ` [デフォルト: ${info.default}]`;
        if (info.required) msg += chalk.red(" *必須");
        const val = await promptInput(msg, info.default || undefined);
        if (val) fields[key] = val;
      }
      console.log();
    }
  }
}

// 確認サマリー
const fieldsSummary = Object.entries(fields)
  .map(([k, v]) => `${k}=${v}`)
  .join(", ");
console.log();
printHeader("実行サマリー");
console.log(`  Workflow : ${chalk.bold(wfFile)}`);
console.log(`  Branch   : ${chalk.bold(selectedBranch)}`);
console.log(`  Inputs   : ${fieldsSummary || "(なし)"}\n`);

const proceed = noConfirm || (await promptConfirm("このワークフローを実行しますか?"));
if (!proceed) {
  console.log(chalk.dim("キャンセルしました。"));
  process.exit(0);
}

try {
  await triggerWorkflow(wfFile, selectedBranch, repo, fields);
  console.log(chalk.green.bold("\n✓ ワークフローをトリガーしました。\n"));
} catch (e) {
  console.error(chalk.red.bold("\n✗ ワークフローのトリガーに失敗しました。"));
  console.error(chalk.dim("  ヒント: ブランチ名、権限、workflow_dispatch トリガーの有無を確認\n"));
  process.exit(1);
}

const startMonitor = await promptConfirm("CI モニタリングを開始しますか?", false);
if (startMonitor) {
  const scriptDir = import.meta.dir;
  console.log(chalk.dim("  5 秒待機中..."));
  await Bun.sleep(5000);
  Bun.spawn(["bun", `${scriptDir}/ci-monitor.ts`, "--latest"], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
}
