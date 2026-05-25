import { $ } from "bun";

export interface RunInfo {
  databaseId: number;
  displayTitle: string;
  conclusion: string | null;
  headBranch: string;
  status: string;
  createdAt: string;
}

export interface JobInfo {
  name: string;
  conclusion: string | null;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  runnerName: string | null;
}

export interface WorkflowInfo {
  id: number;
  name: string;
  path: string;
  state: string;
}

export interface ListRunsOptions {
  repo?: string;
  limit?: number;
  status?: string;
}

export async function listRuns(opts: ListRunsOptions = {}): Promise<RunInfo[]> {
  const args = [
    "run",
    "list",
    "--json",
    "databaseId,displayTitle,conclusion,headBranch,status,createdAt",
  ];
  if (opts.repo) args.push("--repo", opts.repo);
  if (opts.limit) args.push("--limit", String(opts.limit));
  if (opts.status) args.push("--status", opts.status);
  return (await $`gh ${args}`.json()) as RunInfo[];
}

export async function listJobs(runId: string, repo?: string): Promise<JobInfo[]> {
  const args = ["run", "view", runId, "--json", "jobs"];
  if (repo) args.push("--repo", repo);
  const data = (await $`gh ${args}`.json()) as { jobs: JobInfo[] };
  return data.jobs;
}

export async function getRunLog(runId: string, repo?: string, failedOnly = true): Promise<string> {
  const flag = failedOnly ? "--log-failed" : "--log";
  const args = ["run", "view", runId, flag];
  if (repo) args.push("--repo", repo);
  return await $`gh ${args}`.text();
}

export async function listWorkflows(repo?: string): Promise<WorkflowInfo[]> {
  const args = ["workflow", "list", "--json", "id,name,path,state"];
  if (repo) args.push("--repo", repo);
  const all = (await $`gh ${args}`.json()) as WorkflowInfo[];
  return all.filter((w: WorkflowInfo) => w.state === "active");
}

export async function triggerWorkflow(
  workflowFile: string,
  ref: string,
  repo: string,
  fields: Record<string, string>,
): Promise<void> {
  const args = ["workflow", "run", workflowFile, "--repo", repo, "--ref", ref];
  for (const [k, v] of Object.entries(fields)) {
    args.push("--field", `${k}=${v}`);
  }
  await $`gh ${args}`;
}

export function detectRepo(): string | null {
  const result = Bun.spawnSync(["git", "remote", "get-url", "origin"]);
  if (result.exitCode !== 0) return null;
  const url = new TextDecoder().decode(result.stdout).trim();
  return url.replace(/.*github\.com[:/]/, "").replace(/\.git$/, "") || null;
}

export async function validateRepo(repo: string): Promise<boolean> {
  try {
    await $`gh repo view ${repo} --json name`.quiet();
    return true;
  } catch {
    return false;
  }
}

export function localBranches(): string[] {
  const r = Bun.spawnSync(["git", "branch", "--format=%(refname:short)"]);
  const remote = Bun.spawnSync(["git", "branch", "-r", "--format=%(refname:short)"]);
  const local = new TextDecoder().decode(r.stdout).trim().split("\n").filter(Boolean);
  const remotes = new TextDecoder()
    .decode(remote.stdout)
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((b) => b.replace(/^origin\//, ""));
  return [...new Set([...local, ...remotes])].sort();
}
