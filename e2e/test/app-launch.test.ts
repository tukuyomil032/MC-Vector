import { expect } from "chai";
import { By, until } from "selenium-webdriver";
import { saveScreenshot } from "../helpers/screenshot.js";
import { selectors } from "../helpers/selectors.js";
import { startApp, stopApp, type E2EContext } from "./setup.js";

describe("MC-Vector app launch", function () {
  this.timeout(180000);

  let ctx: E2EContext;

  before(async () => {
    ctx = await startApp();
  });

  after(async () => {
    await stopApp(ctx);
  });

  it("shows main UI with non-empty body", async () => {
    try {
      const body = await ctx.driver.wait(
        until.elementLocated(By.css("body")),
        30000,
      );

      const text = await body.getText();

      expect(text.length).to.be.greaterThan(0);

      await saveScreenshot(ctx.driver, ctx.artifactsDir, "app-launch-success");
    } catch (error) {
      await saveScreenshot(ctx.driver, ctx.artifactsDir, "app-launch-failed");
      throw error;
    }
  });

  it("shows app-root element", async () => {
    try {
      await ctx.driver.wait(
        until.elementLocated(By.css(selectors.appRoot)),
        10000,
      );
      await saveScreenshot(ctx.driver, ctx.artifactsDir, "app-root-visible");
    } catch (error) {
      await saveScreenshot(ctx.driver, ctx.artifactsDir, "app-root-failed");
      throw error;
    }
  });

  it("shows server-list panel", async () => {
    try {
      await ctx.driver.wait(
        until.elementLocated(By.css(selectors.serverList)),
        10000,
      );
    } catch (error) {
      await saveScreenshot(ctx.driver, ctx.artifactsDir, "server-list-failed");
      throw error;
    }
  });

  it("shows create-server-button", async () => {
    try {
      await ctx.driver.wait(
        until.elementLocated(By.css(selectors.createServerButton)),
        10000,
      );
    } catch (error) {
      await saveScreenshot(
        ctx.driver,
        ctx.artifactsDir,
        "create-server-button-failed",
      );
      throw error;
    }
  });
});
