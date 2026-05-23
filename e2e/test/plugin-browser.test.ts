import { By, until } from "selenium-webdriver";
import { saveScreenshot } from "../helpers/screenshot.js";
import { selectors } from "../helpers/selectors.js";
import {
  createTestServer,
  deleteTestServer,
} from "../helpers/test-utils.js";
import { startApp, stopApp, type E2EContext } from "./setup.js";

const TEST_SERVER_NAME = "e2e-plugin-test";

describe("Plugin Browser UI", function () {
  this.timeout(300000);

  let ctx: E2EContext;
  let createdServerId: string | null = null;

  before(async () => {
    ctx = await startApp();

    // Create a test server and select it so server-dependent views are accessible
    createdServerId = await createTestServer(
      ctx.driver,
      TEST_SERVER_NAME,
      25598,
      2,
    );

    if (createdServerId) {
      const card = await ctx.driver.wait(
        until.elementLocated(By.css(selectors.serverCard(createdServerId))),
        10000,
      );
      await card.click();
      await ctx.driver.sleep(500);
    }
  });

  after(async () => {
    if (createdServerId) {
      try {
        await deleteTestServer(ctx.driver, createdServerId);
      } catch (_) {
        // ignore cleanup errors
      }
    }
    await stopApp(ctx);
  });

  it("shows plugin-browser when plugins view is selected", async () => {
    if (!createdServerId) {
      throw new Error("Skipped: test server could not be created");
    }

    try {
      const pluginsNav = await ctx.driver.wait(
        until.elementLocated(By.css(selectors.navItem("plugins"))),
        10000,
      );
      await pluginsNav.click();

      await ctx.driver.wait(
        until.elementLocated(By.css(selectors.pluginBrowser)),
        15000,
      );

      await saveScreenshot(
        ctx.driver,
        ctx.artifactsDir,
        "plugin-browser-visible",
      );
    } catch (error) {
      await saveScreenshot(
        ctx.driver,
        ctx.artifactsDir,
        "plugin-browser-failed",
      );
      throw error;
    }
  });

  it("shows plugin search input", async () => {
    if (!createdServerId) {
      throw new Error("Skipped: test server could not be created");
    }

    try {
      await ctx.driver.wait(
        until.elementLocated(By.css(selectors.pluginSearchInput)),
        10000,
      );
    } catch (error) {
      await saveScreenshot(
        ctx.driver,
        ctx.artifactsDir,
        "plugin-search-input-failed",
      );
      throw error;
    }
  });
});
