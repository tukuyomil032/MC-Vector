import { By, Key, until, type WebDriver } from "selenium-webdriver";
import { selectors } from "./selectors.js";

/**
 * Returns the server ID of the last card in the server list.
 * Reads the data-testid attribute: "server-card-{id}" → returns "{id}".
 */
export async function getLastCreatedServerId(
  driver: WebDriver,
): Promise<string | null> {
  const cards = await driver.findElements(
    By.css("[data-testid^='server-card-']"),
  );
  if (cards.length === 0) return null;
  const last = cards[cards.length - 1];
  const testid = await last.getAttribute("data-testid");
  return testid?.replace("server-card-", "") ?? null;
}

/**
 * Creates a test server via the 2-step modal flow (ChoiceModal → AddServerModal).
 * Returns the new server's ID, or null if creation could not be confirmed.
 */
export async function createTestServer(
  driver: WebDriver,
  name: string,
  port = 25599,
  memory = 2,
): Promise<string | null> {
  const createBtn = await driver.wait(
    until.elementLocated(By.css(selectors.createServerButton)),
    10000,
  );
  await createBtn.click();

  const choiceModal = await driver.wait(
    until.elementLocated(By.css(selectors.addServerChoiceModal)),
    10000,
  );
  await choiceModal;

  const newServerBtn = await driver.wait(
    until.elementLocated(By.css(selectors.choiceNewServerButton)),
    5000,
  );
  await newServerBtn.click();

  const addModal = await driver.wait(
    until.elementLocated(By.css(selectors.addServerModal)),
    10000,
  );
  await addModal;

  const nameInput = await driver.wait(
    until.elementLocated(By.css(selectors.serverNameInput)),
    5000,
  );
  await nameInput.clear();
  await nameInput.sendKeys(name);

  const portInput = await driver.findElement(
    By.css(selectors.serverPortInput),
  );
  await portInput.clear();
  await portInput.sendKeys(String(port));

  const memoryInput = await driver.findElement(
    By.css(selectors.serverMemoryInput),
  );
  await memoryInput.clear();
  await memoryInput.sendKeys(String(memory));

  const submitBtn = await driver.findElement(
    By.css(selectors.saveServerButton),
  );
  await submitBtn.click();

  await driver.wait(async () => {
    const modals = await driver.findElements(
      By.css(selectors.addServerModal),
    );
    return modals.length === 0;
  }, 15000);

  return getLastCreatedServerId(driver);
}

/**
 * Deletes a server via the ContextMenu right-click flow.
 */
export async function deleteTestServer(
  driver: WebDriver,
  serverId: string,
): Promise<void> {
  const card = await driver.wait(
    until.elementLocated(By.css(selectors.serverCard(serverId))),
    10000,
  );

  const actions = driver.actions({ async: true });
  await actions.contextClick(card).perform();

  const deleteBtn = await driver.wait(
    until.elementLocated(By.css(selectors.deleteServerButton(serverId))),
    5000,
  );
  await deleteBtn.click();

  await driver.wait(async () => {
    const cards = await driver.findElements(
      By.css(selectors.serverCard(serverId)),
    );
    return cards.length === 0;
  }, 10000);
}

export { Key };
