import { expect } from "chai";
import { By, until } from "selenium-webdriver";
import { startApp, stopApp, type E2EContext } from "./setup.js";
import { saveScreenshot } from "../helpers/screenshot.js";

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
});
