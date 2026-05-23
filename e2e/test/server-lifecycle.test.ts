import { expect } from "chai";
import { By, until } from "selenium-webdriver";
import { saveScreenshot } from "../helpers/screenshot.js";
import { selectors } from "../helpers/selectors.js";
import {
  createTestServer,
  deleteTestServer,
} from "../helpers/test-utils.js";
import { startApp, stopApp, type E2EContext } from "./setup.js";

const TEST_SERVER_NAME = "e2e-test-server";

describe("Server Lifecycle", function () {
  this.timeout(300000);

  let ctx: E2EContext;
  let createdServerId: string | null = null;

  before(async () => {
    ctx = await startApp();
  });

  after(async () => {
    // Clean up: delete the created server if it exists
    if (createdServerId) {
      try {
        await deleteTestServer(ctx.driver, createdServerId);
      } catch (_) {
        // ignore cleanup errors to not mask test failures
      }
    }
    await stopApp(ctx);
  });

  it("creates a new server via modal", async () => {
    try {
      createdServerId = await createTestServer(
        ctx.driver,
        TEST_SERVER_NAME,
        25599,
        2,
      );

      expect(createdServerId).to.not.be.null;

      await saveScreenshot(
        ctx.driver,
        ctx.artifactsDir,
        "server-created",
      );
    } catch (error) {
      await saveScreenshot(
        ctx.driver,
        ctx.artifactsDir,
        "server-create-failed",
      );
      throw error;
    }
  });

  it("shows created server in server list", async () => {
    if (!createdServerId) {
      throw new Error(
        "Skipped: previous test (server creation) did not produce a server ID",
      );
    }

    try {
      const card = await ctx.driver.wait(
        until.elementLocated(By.css(selectors.serverCard(createdServerId))),
        10000,
      );

      const isDisplayed = await card.isDisplayed();
      expect(isDisplayed).to.be.true;

      await saveScreenshot(
        ctx.driver,
        ctx.artifactsDir,
        "server-in-list",
      );
    } catch (error) {
      await saveScreenshot(
        ctx.driver,
        ctx.artifactsDir,
        "server-in-list-failed",
      );
      throw error;
    }
  });
});
