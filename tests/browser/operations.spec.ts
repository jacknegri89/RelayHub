import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { settings } from "@relayhub/shared/config";
import { sampleEvent, submitSigned } from "../../scripts/demo-fixtures";

const { DEMO_RECEIVER_URL } = settings();

test("the spacetime diagram reacts to visitors and respects reduced motion", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Send one webhook to multiple services",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  const art = page.getByRole("figure", {
    name: "Spacetime diagram of webhook deliveries",
  });
  const canvas = art.locator("canvas");
  const frame = () =>
    canvas.evaluate((surface) => {
      if (!(surface instanceof HTMLCanvasElement)) {
        throw new Error("Expected the animated canvas");
      }
      return surface.toDataURL();
    });
  const first = await frame();
  await expect.poll(frame).not.toBe(first);

  await page.getByRole("button", { name: "Pause time" }).click();
  const paused = await frame();
  await page.waitForTimeout(400);
  expect(await frame()).toBe(paused);
  const pointerPosition = await canvas.evaluate((surface) => ({
    x: surface.clientWidth * 0.75,
    y: surface.clientHeight * 0.4,
  }));
  await canvas.hover({ position: pointerPosition });
  await expect.poll(async () => (await frame()) !== paused).toBe(true);
  await page.getByRole("button", { name: "Send a test order" }).click();
  const route = page.getByRole("region", { name: "Order route" });
  await expect(
    route.getByText("Awaiting signature", { exact: true }),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(route.getByText("Sending", { exact: false })).toHaveCount(3);
  await page.getByRole("button", { name: "Resume time" }).click();

  const endpointB = page.getByRole("switch", { name: /Billing/ });
  await endpointB.click();
  await expect(endpointB).toHaveAttribute("aria-checked", "false");
  const log = page.getByRole("list", { name: "Your events" });
  await page.getByRole("button", { name: "Send a test order" }).click();
  await page.getByText("Order history", { exact: false }).first().click();
  await expect(log).toContainText("order.created", { timeout: 10_000 });
  await expect(log).toContainText("Billing: 503", { timeout: 10_000 });
  await page.getByRole("button", { name: "Tamper with the signature" }).click();
  await expect(log).toContainText("signature mismatch", { timeout: 10_000 });
  // The rejected order stays on screen even as the previous order keeps retrying.
  await expect(async () => {
    const rejected = await frame();
    await page.waitForTimeout(250);
    expect(await frame()).toBe(rejected);
  }).toPass({ timeout: 8_000 });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByRole("button", { name: "Pause time" })).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause time" })).toHaveCount(0);
  await expect(art.getByText("Retry delay", { exact: true })).toBeVisible();
  const still = await frame();
  await page.waitForTimeout(500);
  expect(await frame()).toBe(still);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375,
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("a visitor restores one service and finishes the same order step by step", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const board = page.getByRole("region", { name: "Order route" });
  const billing = board
    .getByRole("listitem")
    .filter({ has: page.getByRole("switch", { name: "Billing" }) });
  await billing.getByRole("switch").click();
  await page.getByRole("button", { name: "Send a test order" }).click();
  await expect(board.getByRole("status")).toHaveText("2 of 3 delivered");
  await expect(billing).toContainText("HTTP 503");
  const resultText = billing.getByText("Retry scheduled", { exact: false });
  const resultBox = await resultText.boundingBox();
  const switchBox = await billing.getByRole("switch").boundingBox();
  expect(
    resultBox && switchBox && resultBox.y >= switchBox.y + switchBox.height,
  ).toBe(true);
  const history = page.locator("summary").filter({ hasText: "Order history" });
  const orderCode = await history.locator("code").innerText();
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await billing.getByRole("switch").click();
  const step = page.getByRole("button", { name: "Next step" });
  await step.click();
  await expect(billing).toContainText("Sending");
  await step.click();
  await expect(board.getByRole("status")).toBeFocused();
  await page.getByRole("button", { name: "Route", exact: true }).click();
  await expect(billing).toContainText("HTTP 204");
  await expect(billing).toContainText("attempt 2");
  await expect(board.getByRole("status")).toHaveText("3 of 3 delivered");
  await expect(history.locator("code")).toHaveText(orderCode);
  await expect(step).toHaveCount(0);
  await page.getByRole("button", { name: "Tamper with the signature" }).click();
  await expect(board).toContainText("401 · Invalid signature");
  await expect(board.getByRole("status")).toHaveText("No deliveries created");
  await expect(board.getByText("Not sent", { exact: true })).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
});

test("operator signs in, routes a webhook, and retries a failed delivery", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  const email = "browser-" + randomUUID() + "@relayhub.example";
  const password = randomUUID();
  await page.goto("/register");
  await page.getByLabel("Name").fill("Browser Operator");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.waitForTimeout(650);
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(
    page.getByRole("heading", { name: "Organizations" }),
  ).toBeVisible();
  await page.getByLabel("Account menu", { exact: true }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.waitForTimeout(650);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Organization name").fill("Browser relay demo");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  const orgPath = new URL(page.url()).pathname;
  await expect(
    page.getByRole("region", { name: "Check delivery health" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Sources", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Identify the sender" }),
  ).toContainText("Save the signing secret");
  const createSource = page.locator("#create-source");
  await expect(createSource).toHaveAttribute("open", "");
  await createSource.getByLabel("Source name").fill("Shop");
  await createSource.getByRole("button", { name: "Create source" }).click();
  const secretField = createSource.getByLabel("Signing secret");
  await expect(secretField).toBeVisible();
  const secret = await secretField.inputValue();
  const shop = page.getByRole("region", { name: "Shop", exact: true });
  await shop.getByText("Source details", { exact: true }).click();
  const endpoint = await shop
    .locator("code", { hasText: "/api/webhooks/" })
    .textContent();
  const sourceId = endpoint?.split("/").at(-1) ?? "";

  await page.reload();
  await expect(createSource).not.toHaveAttribute("open", "");
  await page.getByRole("link", { name: "New source" }).click();
  await expect(page).toHaveURL(/#create-source$/);
  await expect(createSource.getByLabel("Source name")).toBeFocused();
  await createSource.getByLabel("Source name").fill("Release repository");
  await createSource.getByLabel("Source type").selectOption("github");
  await createSource.getByRole("button", { name: "Create source" }).click();
  const repositorySource = page.getByRole("region", {
    name: "Release repository",
    exact: true,
  });
  await repositorySource.getByText("Source details", { exact: true }).click();
  await expect(page).toHaveURL(/#create-source$/);
  await expect(secretField).toBeVisible();
  await page.getByText("Connect a GitHub repository", { exact: true }).click();
  await expect(
    page.getByText(/Set Content type to application\/json/),
  ).toBeVisible();
  await expect(page.getByText(/look for github\.push in Events/)).toBeVisible();
  await page.reload();
  await expect(createSource.getByLabel("Source name")).toBeFocused();
  await expect(page.getByLabel("Signing secret", { exact: true })).toHaveCount(
    0,
  );

  await page.getByRole("link", { name: "Destinations", exact: true }).click();
  const createDestination = page.locator("#create-destination");
  await expect(createDestination).toHaveAttribute("open", "");
  await createDestination
    .getByLabel("Destination name")
    .fill("Browser receiver");
  await createDestination
    .getByLabel("Destination URL")
    .fill(DEMO_RECEIVER_URL + "/hooks/permanent");
  await createDestination
    .getByRole("button", { name: "Create destination" })
    .click();
  const receiver = page.getByRole("region", {
    name: "Browser receiver",
    exact: true,
  });
  await receiver.getByText("Endpoint and routes", { exact: true }).click();
  await page.getByText("Link source", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Source", exact: true })
    .selectOption({ label: "Shop" });
  await page.getByRole("button", { name: "Save route" }).click();
  await expect(page.getByText("all event types")).toBeVisible();

  const id = randomUUID();
  expect(
    (await submitSigned(sourceId, secret, id, sampleEvent("order.created", id)))
      .status,
  ).toBe(202);
  await page.getByRole("link", { name: "Events", exact: true }).click();
  await page.getByRole("link", { name: "order.created" }).click();
  await expect(
    page.getByRole("region", { name: "Follow this event" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Browser receiver" }).click();
  await page.waitForURL("**/deliveries/*");
  await expect(
    page.getByRole("region", { name: "Read the attempts" }),
  ).toBeVisible();
  const deliveryUrl = page.url();
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByRole("button", { name: "Retry delivery" }).isVisible();
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  await expect(page.locator(".timeline").getByText("HTTP 400")).toBeVisible();
  await expect(
    page.getByRole("img", { name: /attempt 1: HTTP 400/ }),
  ).toBeVisible();

  await page.goto(orgPath + "/destinations");
  await expect(createDestination).not.toHaveAttribute("open", "");
  await page.getByRole("link", { name: "New destination" }).click();
  await expect(createDestination.getByLabel("Destination name")).toBeFocused();
  await receiver.getByText("Endpoint and routes", { exact: true }).click();
  const editSummary = receiver.getByText("Edit destination", { exact: true });
  await editSummary.click();
  const edit = editSummary.locator("..");
  await edit
    .getByLabel("Destination URL")
    .fill(DEMO_RECEIVER_URL + "/hooks/success");
  await edit.getByRole("button", { name: "Save destination" }).click();
  await expect(edit.getByRole("status")).toHaveText("Saved.");
  await page.goto(deliveryUrl);
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/api/organizations/") &&
        response.ok(),
    ),
    page.getByRole("button", { name: "Retry delivery" }).click(),
  ]);
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByText("Final outcome: delivered").isVisible();
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  await expect(page.locator(".timeline").getByText("HTTP 200")).toBeVisible();
  const timeline = await page.locator(".timeline > li").allTextContents();
  expect(timeline[1]).toContain("Attempt 1");
  expect(timeline[2]).toContain("Most recently queued");
  expect(timeline[3]).toContain("Attempt 2");
  await page.screenshot({
    path: "test-results/relayhub-delivery.png",
    fullPage: true,
  });
  await page.goto(orgPath);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.screenshot({
    path: "test-results/relayhub-overview.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(orgPath + "/events");
  await expect(
    page.getByRole("table", { name: "Webhook events" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375,
  );
  expect(browserErrors).toEqual([]);
});

test("authentication is accessible at 375 px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375,
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
