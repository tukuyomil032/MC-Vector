import { By, until } from "selenium-webdriver";
import { saveScreenshot } from "../helpers/screenshot.js";
import { selectors } from "../helpers/selectors.js";
import { startApp, stopApp, type E2EContext } from "./setup.js";

const NAV_VIEWS = [
  "dashboard",
  "console",
  "plugins",
  "backups",
  "files",
  "properties",
] as const;

describe("Navigation", function () {
  this.timeout(180000);

  let ctx: E2EContext;

  before(async () => {
    ctx = await startApp();
    // Ensure the sidebar is open so nav items are present
    const toggleBtns = await ctx.driver.findElements(
      By.css(selectors.sidebarToggleButton),
    );
    if (toggleBtns.length > 0) {
      const sidebar = await ctx.driver.findElements(
        By.css(selectors.appSidebar),
      );
      if (sidebar.length > 0) {
        const isOpen = await ctx.driver
          .findElement(By.css(selectors.appSidebar))
          .getAttribute("class");
        if (!isOpen.includes("app-sidebar--open")) {
          await toggleBtns[0].click();
          await ctx.driver.sleep(500);
        }
      }
    }
  });

  after(async () => {
    await stopApp(ctx);
  });

  for (const view of NAV_VIEWS) {
    it(`nav-item-${view} is present and clickable`, async () => {
      try {
        const navItem = await ctx.driver.wait(
          until.elementLocated(By.css(selectors.navItem(view))),
          10000,
        );
        await navItem.click();
        // Wait for main content area to remain present (view switched)
        await ctx.driver.wait(
          until.elementLocated(By.css(selectors.appMainContent)),
          5000,
        );
      } catch (error) {
        await saveScreenshot(
          ctx.driver,
          ctx.artifactsDir,
          `nav-${view}-failed`,
        );
        throw error;
      }
    });
  }

  it("sidebar-brand-button opens settings window", async () => {
    try {
      const brandBtn = await ctx.driver.wait(
        until.elementLocated(By.css(selectors.sidebarBrandButton)),
        10000,
      );
      await brandBtn.click();

      await ctx.driver.wait(
        until.elementLocated(By.css(selectors.settingsWindow)),
        10000,
      );
      await saveScreenshot(
        ctx.driver,
        ctx.artifactsDir,
        "settings-window-opened",
      );
    } catch (error) {
      await saveScreenshot(
        ctx.driver,
        ctx.artifactsDir,
        "settings-window-open-failed",
      );
      throw error;
    }
  });

  it("settings window can be closed via back button", async () => {
    try {
      const settingsEl = await ctx.driver.wait(
        until.elementLocated(By.css(selectors.settingsWindow)),
        5000,
      );

      // Click the first button in the settings header (back button)
      const backBtn = await settingsEl.findElement(
        By.css(".settings-window__header button"),
      );
      await backBtn.click();

      // Settings window should no longer be visible
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
        "settings-window-close-failed",
      );
      throw error;
    }
  });
});
