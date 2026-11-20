import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { settings } from "@relayhub/shared/config";
import { sampleEvent, submitSigned } from "../../scripts/demo-fixtures";

const { DEMO_RECEIVER_URL } = settings();

test("public homepage simulates a delivery and a retry at desktop and mobile widths", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /webhooks.*under control/i }),
  ).toBeVisible();
  const simulator = page.getByRole("region", { name: "Webhook simulator" });
  await simulator.getByRole("button", { name: "Simulate retry" }).click();
  await expect(simulator.getByRole("status")).toHaveText(
    "503 · Retry scheduled",
  );
  await expect(simulator.getByRole("status")).toHaveText("204 · Delivered");
  await expect(
    simulator.getByText("Attempt 1 returned 503. Attempt 2 returned 204."),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await simulator.getByRole("button", { name: "Simulate delivery" }).click();
  await expect(simulator.getByRole("status")).toHaveText("204 · Delivered");
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

  await page.getByRole("link", { name: "Sources" }).click();
  await page.getByLabel("Source name").fill("Shop");
  await page.getByRole("button", { name: "Create source" }).click();
  const secret = await page.getByLabel("Signing secret").inputValue();
  const endpoint = await page
    .locator("code", { hasText: "/api/webhooks/" })
    .textContent();
  const sourceId = endpoint?.split("/").at(-1) ?? "";

  await page.getByRole("link", { name: "Destinations" }).click();
  await page.getByLabel("Destination name").fill("Browser receiver");
  await page
    .getByLabel("Destination URL")
    .fill(DEMO_RECEIVER_URL + "/hooks/permanent");
  await page.getByRole("button", { name: "Create destination" }).click();
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
  await page.getByRole("link", { name: "Browser receiver" }).click();
  await page.waitForURL("**/deliveries/*");
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
  await expect(page.getByText("HTTP 400")).toBeVisible();

  await page.goto(orgPath + "/destinations");
  await page.getByText("Edit destination", { exact: true }).click();
  const edit = page.locator("details").filter({ hasText: "Edit destination" });
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
  await expect(page.getByText("HTTP 200")).toBeVisible();
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
