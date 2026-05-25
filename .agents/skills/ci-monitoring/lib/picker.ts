import { search, select, input, confirm } from "@inquirer/prompts";
import type { RunInfo, WorkflowInfo } from "./gh.ts";

export interface PickRunOptions {
  status?: string;
  message?: string;
}

export async function pickRun(runs: RunInfo[], opts: PickRunOptions = {}): Promise<RunInfo> {
  const label = opts.message ?? "Run を選択";
  const conclusion = (r: RunInfo) => r.conclusion ?? r.status;

  return search<RunInfo>({
    message: label,
    source: async (term) => {
      const filtered = term
        ? runs.filter(
            (r) =>
              r.displayTitle.toLowerCase().includes(term.toLowerCase()) ||
              r.headBranch.toLowerCase().includes(term.toLowerCase()),
          )
        : runs;
      return filtered.map((r) => ({
        name: `[${r.headBranch.slice(0, 20)}] ${conclusion(r).padEnd(10)} ${r.displayTitle.slice(0, 50)}`,
        value: r,
        short: `#${r.databaseId}`,
      }));
    },
  });
}

export async function pickWorkflow(workflows: WorkflowInfo[]): Promise<WorkflowInfo> {
  return search<WorkflowInfo>({
    message: "ワークフローを選択",
    source: async (term) => {
      const filtered = term
        ? workflows.filter(
            (w) =>
              w.name.toLowerCase().includes(term.toLowerCase()) ||
              w.path.toLowerCase().includes(term.toLowerCase()),
          )
        : workflows;
      return filtered.map((w) => ({
        name: `${w.path.split("/").at(-1)}  (${w.name})`,
        value: w,
        short: w.name,
      }));
    },
  });
}

export async function pickBranch(branches: string[]): Promise<string> {
  return search<string>({
    message: "ブランチを選択",
    source: async (term) => {
      const filtered = term ? branches.filter((b) => b.includes(term)) : branches;
      return filtered.map((b) => ({ name: b, value: b }));
    },
  });
}

export async function promptInput(message: string, defaultValue?: string): Promise<string> {
  return input({ message, default: defaultValue });
}

export async function promptRepo(current?: string): Promise<string> {
  return input({
    message: "GitHub リポジトリを入力 (owner/repo):",
    default: current,
    validate: (v: string) => (v.includes("/") ? true : "owner/repo の形式で入力してください"),
  });
}

export async function promptConfirm(message: string, defaultValue = true): Promise<boolean> {
  return confirm({ message, default: defaultValue });
}
