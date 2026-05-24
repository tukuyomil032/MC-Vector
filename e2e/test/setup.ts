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
  // macOS: use tauri-wd (danielraffel/tauri-webdriver) because the official
  // tauri-driver does not support WKWebView. Other platforms use the standard driver.
  if (process.platform === "darwin") {
    return path.resolve(os.homedir(), ".cargo", "bin", "tauri-wd");
  }
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

  const isMacos = process.platform === "darwin";
  // tauri-wd requires --port flag; tauri-driver uses positional args (defaults to 4444)
  const driverArgs = isMacos ? ["--port", "4444"] : [];
  const tauriDriver = spawn(driverPath, driverArgs, {
    stdio: ["ignore", "inherit", "inherit"],
    shell: false,
  });

  await waitForPort(4444, 30000);

  const capabilities = new Capabilities();
  // selenium-webdriver requires setBrowserName regardless of platform
  capabilities.setBrowserName("wry");
  if (isMacos) {
    // tauri-wd (danielraffel/tauri-webdriver) uses "binary" key instead of "application"
    capabilities.set("tauri:options", { binary: appPath });
  } else {
    capabilities.set("tauri:options", { application: appPath });
  }

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

  // macOS on CI: wait for Tauri IPC to initialize before returning.
  // The tauri-wd session is created as soon as the plugin HTTP server starts,
  // but __TAURI_INTERNALS__ initializes only after the full page load.
  // On slow CI runners (no GPU, software rendering, 15MB+ JS bundle) this
  // can lag far behind session creation, causing every command to timeout.
  if (process.platform === "darwin" && process.env.CI) {
    const deadline = Date.now() + 60_000;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        await driver.executeScript("return 1");
        ready = true;
        break;
      } catch {
        await new Promise<void>((r) => setTimeout(r, 3_000));
      }
    }
    if (!ready) {
      tauriDriver.kill();
      throw new Error(
        "macOS CI: Tauri IPC did not initialize within 60s — app may not be rendering",
      );
    }
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
