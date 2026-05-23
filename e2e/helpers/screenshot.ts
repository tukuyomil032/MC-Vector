import path from "node:path";
import fs from "node:fs";
import type { ThenableWebDriver } from "selenium-webdriver";

export async function saveScreenshot(
  driver: ThenableWebDriver,
  artifactsDir: string,
  name: string,
): Promise<string> {
  fs.mkdirSync(artifactsDir, { recursive: true });

  const base64 = await driver.takeScreenshot();
  const filePath = path.join(artifactsDir, `${name}.png`);

  fs.writeFileSync(filePath, Buffer.from(base64, "base64"));

  return filePath;
}
