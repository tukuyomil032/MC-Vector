import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { Builder, Capabilities, type WebDriver } from "selenium-webdriver";

const repoRoot = path.resolve(process.cwd(), "..");

function appBinaryPath(): string {
  const exeName =
    process.platform === "win32" ? "mc-vector.exe" : "mc-vector";
  return path.resolve(repoRoot, "src-tauri", "target", "debug", exeName);
}

function tauriDriverPath(): string {
  const fileName =
    process.platform === "win32" ? "tauri-driver.exe" : "tauri-driver";
  return path.resolve(os.homedir(), ".cargo", "bin", fileName);
}

export interface E2EContext {
  driver: WebDriver;
  tauriDriver: ChildProcess;
  artifactsDir: string;
}

export function ensureArtifactsDir(): string {
  const artifactsDir = path.resolve(process.cwd(), "artifacts");
  fs.mkdirSync(artifactsDir, { recursive: true });
  return artifactsDir;
}

export async function startApp(): Promise<E2EContext> {
  const artifactsDir = ensureArtifactsDir();

  const buildResult = spawnSync(
    "pnpm",
    ["exec", "tauri", "build", "--debug", "--no-bundle"],
    {
      cwd: repoRoot,
      stdio: "inherit",
      shell: true,
    },
  );

  if (buildResult.status !== 0) {
    throw new Error("Failed to build Tauri debug app");
  }

  const appPath = appBinaryPath();

  if (!fs.existsSync(appPath)) {
    throw new Error(
      `App binary not found: ${appPath}\nsrc-tauri/Cargo.toml の package.name を確認してください。`,
    );
  }

  const tauriDriver = spawn(tauriDriverPath(), [], {
    stdio: ["ignore", "inherit", "inherit"],
    shell: false,
  });

  await new Promise<void>((resolve) => setTimeout(resolve, 2000));

  const capabilities = new Capabilities();
  capabilities.setBrowserName("wry");
  capabilities.set("tauri:options", {
    application: appPath,
  });

  const driver = await new Builder()
    .withCapabilities(capabilities)
    .usingServer("http://127.0.0.1:4444/")
    .build();

  return { driver, tauriDriver, artifactsDir };
}

export async function stopApp(ctx: E2EContext): Promise<void> {
  try {
    await ctx.driver.quit();
  } finally {
    ctx.tauriDriver.kill();
  }
}
