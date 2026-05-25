import chalk from "chalk";
import type { ChalkInstance } from "chalk";
import Table from "cli-table3";
import type { JobInfo } from "./gh.ts";

export function conclusionBadge(conclusion: string | null, status: string): string {
  switch (conclusion) {
    case "success":
      return chalk.green("✓ PASS");
    case "failure":
      return chalk.red("✗ FAIL");
    case "cancelled":
      return chalk.yellow("⊘ CANCEL");
    case "skipped":
      return chalk.dim("— SKIP");
    default:
      return chalk.yellow(`⋯ ${status}`);
  }
}

export function buildJobTable(jobs: JobInfo[]): { table: string; passed: number; failed: number } {
  const table = new Table({
    head: [
      chalk.cyan.bold("Job"),
      chalk.cyan.bold("Status"),
      chalk.cyan.bold("Duration"),
      chalk.cyan.bold("Runner"),
    ],
    colWidths: [28, 12, 12, 20],
    style: { border: ["cyan"] },
  });

  let passed = 0;
  let failed = 0;

  for (const job of jobs) {
    const badge = conclusionBadge(job.conclusion, job.status);

    let duration = "—";
    if (job.startedAt && job.completedAt) {
      const diff = Math.floor(
        (new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000,
      );
      duration = `${Math.floor(diff / 60)}m ${diff % 60}s`;
    }

    if (job.conclusion === "success") passed++;
    if (job.conclusion === "failure") failed++;

    table.push([job.name.slice(0, 26), badge, duration, (job.runnerName ?? "—").slice(0, 18)]);
  }

  return { table: table.toString(), passed, failed };
}

export function printHeader(title: string): void {
  const line = "─".repeat(Math.max(title.length + 4, 50));
  console.log(chalk.cyan.bold(`┌${line}┐`));
  console.log(chalk.cyan.bold("│") + `  ${title}  ` + chalk.cyan.bold("│"));
  console.log(chalk.cyan.bold(`└${line}┘`));
}

export function printSection(label: string, color: ChalkInstance = chalk.cyan): void {
  console.log(color.bold(`\n▶ ${label}`));
  console.log(chalk.dim("─".repeat(60)));
}
