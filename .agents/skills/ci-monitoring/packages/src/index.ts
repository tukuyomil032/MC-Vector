#!/usr/bin/env bun
import { select } from "@inquirer/prompts";

const choice = await select({
  message: "実行するコマンドを選択:",
  choices: [
    { name: "CI Monitor        — リアルタイムジョブ監視", value: "ci-monitor" },
    { name: "Analyze Failure   — 失敗ログ分析", value: "analyze-failure" },
    { name: "Report Table      — ジョブステータス一覧", value: "report-table" },
    { name: "GHA Summary       — CI サマリー生成", value: "gha-summary" },
    { name: "Trigger Workflow  — ワークフロー起動", value: "gha-trigger" },
  ],
});

await import(`./scripts/${choice}.ts`);
