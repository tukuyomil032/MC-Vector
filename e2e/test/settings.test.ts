import { By, until } from "selenium-webdriver";
import { saveScreenshot } from "../helpers/screenshot.js";
import { selectors } from "../helpers/selectors.js";
import { startApp, stopApp, type E2EContext } from "./setup.js";

describe("Settings Window", function () {
  this.timeout(180000);

  let ctx: E2EContext;

  before(async () => {
    ctx = await startApp();
  });

  after(async () => {
    await stopApp(ctx);
  });

  it("opens settings window via sidebar brand button", async () => {
    try {
      const brandBtn = await ctx.driver.wait(
        until.elementLocated(By.css(selectors.sidebarBrandButton)),
        10000,
      );
      // Wait for button to be interactive before clicking (DOM presence ≠ clickable)
      await ctx.driver.wait(until.elementIsEnabled(brandBtn), 5000);
      await brandBtn.click();

      // Extended to 20s: CI runners under load can take longer for the panel animation
      await ctx.driver.wait(
        until.elementLocated(By.css(selectors.settingsWindow)),
        20000,
      );

      await saveScreenshot(
        ctx.driver,
        ctx.artifactsDir,
        "settings-window-open",
      );
    } catch (error) {
      await saveScreenshot(
        ctx.driver,
        ctx.artifactsDir,
        "settings-open-failed",
      );
      throw error;
    }
  });

  it("settings window contains language select", async () => {
    try {
      const settingsEl = await ctx.driver.wait(
        until.elementLocated(By.css(selectors.settingsWindow)),
        5000,
      );

      // language select has id="language-select" in SettingsWindow.tsx
      const langSelect = await settingsEl.findElement(By.id("language-select"));
      const isDisplayed = await langSelect.isDisplayed();

      if (!isDisplayed) {
        throw new Error("language-select is not visible");
      }
    } catch (error) {
      await saveScreenshot(
        ctx.driver,
        ctx.artifactsDir,
        "language-select-failed",
      );
      throw error;
    }
  });

  it("can close settings window via back button", async () => {
    try {
      const settingsEl = await ctx.driver.wait(
        until.elementLocated(By.css(selectors.settingsWindow)),
        5000,
      );

      const backBtn = await settingsEl.findElement(
        By.css(".settings-window__header button"),
      );
      await backBtn.click();

      await ctx.driver.wait(async () => {
        const els = await ctx.driver.findElements(
          By.css(selectors.settingsWindow),
        );
        return els.length === 0;
      }, 10000);

      await saveScreenshot(
        ctx.driver,
        ctx.artifactsDir,
        "settings-window-closed",
      );
    } catch (error) {
      await saveScreenshot(
        ctx.driver,
        ctx.artifactsDir,
        "settings-close-failed",
      );
      throw error;
    }
  });
});
