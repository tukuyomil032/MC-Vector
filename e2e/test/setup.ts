import http from "node:http";
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

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          { host: "127.0.0.1", port, path: "/" },
          () => resolve(),
        );
        req.on("error", reject);
        req.end();
      });
      return;
    } catch {
      await new Promise<void>((r) => setTimeout(r, 500));
    }
  }
  throw new Error(
    `tauri-driver did not start on port ${port} within ${timeoutMs}ms`,
  );
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

  const driverPath = tauriDriverPath();
  if (!fs.existsSync(driverPath)) {
    throw new Error(
      `tauri-driver not found: ${driverPath}\nRun: cargo install tauri-driver --locked`,
    );
  }

  const tauriDriver = spawn(driverPath, [], {
    stdio: ["ignore", "inherit", "inherit"],
    shell: false,
  });

  await waitForPort(4444, 30000);

  const capabilities = new Capabilities();
  capabilities.setBrowserName("wry");
  capabilities.set("tauri:options", {
    application: appPath,
  });

  let driver: WebDriver;
  try {
    driver = await new Builder()
      .withCapabilities(capabilities)
      .usingServer("http://127.0.0.1:4444/")
      .build();
  } catch (err) {
    tauriDriver.kill();
    throw err;
  }

  return { driver, tauriDriver, artifactsDir };
}

export async function stopApp(ctx: E2EContext | undefined): Promise<void> {
  if (!ctx) return;
  try {
    await ctx.driver.quit();
  } finally {
    ctx.tauriDriver.kill();
  }
}
