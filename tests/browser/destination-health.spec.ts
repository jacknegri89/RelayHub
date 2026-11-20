import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";

const config = settings();
const eventType = "test.destination.health";

type Fixture = {
  organizationId: string;
  sourceId: string;
  destinationId: string;
};

async function registerOperator(page: Page) {
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Destination operator");
  await page
    .getByLabel("Email", { exact: true })
    .fill(randomUUID() + "@relayhub.example");
  await page.getByLabel("Password", { exact: true }).fill(randomUUID());
  await page.waitForFunction(() => {
    const proof = document.querySelector<HTMLInputElement>("[name=formProof]");
    return proof && Date.now() - Number(proof.value.split(".")[0]) >= 650;
  });
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(
    page.getByRole("heading", { name: "Organizations" }),
  ).toBeVisible();
}

async function postCommand(
  page: Page,
  path: string,
  values: object,
  status = 200,
): Promise<string> {
  const response = await page.request.post(path, {
    headers: { origin: config.RELAYHUB_BASE_URL },
    data: values,
  });
  expect(response.status()).toBe(status);
  const result = await response.json();
  expect(typeof result.id).toBe("string");
  return result.id;
}

async function createFixture(page: Page, name: string): Promise<Fixture> {
  const organizationId = await postCommand(
    page,
    "/api/organizations",
    { name: "Health " + randomUUID() },
    201,
  );
  const path = "/api/organizations/" + organizationId;
  const sourceId = await postCommand(page, path, {
    action: "source_create",
    name: "Health checks",
  });
  const destinationId = await postCommand(page, path, {
    action: "destination_create",
    name,
    url: config.DEMO_RECEIVER_URL + "/hooks/permanent",
  });
  await postCommand(page, path, {
    action: "route_save",
    sourceId,
    destinationId,
    eventType,
  });
  return { organizationId, sourceId, destinationId };
}

// Wait for these exact deliveries: absence of an alert is meaningful only after the worker commits.
async function sendAndWait(
  page: Page,
  fixture: Fixture,
  count: number,
  status: "failed" | "delivered",
) {
  const eventIds: string[] = [];
  const { organizationId, sourceId, destinationId } = fixture;
  for (let index = 0; index < count; index++) {
    const eventId = await postCommand(
      page,
      "/api/organizations/" + organizationId,
      {
        action: "test_delivery",
        sourceId,
        destinationId,
        eventType,
      },
    );
    eventIds.push(eventId);
  }
  await expect
    .poll(
      () =>
        database().delivery.count({
          where: {
            organizationId,
            destinationId,
            eventId: { in: eventIds },
            status,
          },
        }),
      { timeout: 20_000 },
    )
    .toBe(count);
}

async function alertSummary(page: Page, organizationId: string) {
  const response = await page.request.get(
    "/api/organizations/" + organizationId + "/destination-alerts",
  );
  expect(response.status()).toBe(200);
  return response.json() as Promise<{
    openCount: number;
    latest: {
      id: string;
      kind: string;
      destinationId: string;
      name: string;
      at: string;
    } | null;
  }>;
}

test.afterAll(async () => {
  await database().$disconnect();
});

test("destination health follows a single outage and recovery across workspace views", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  expect(config.isDemo).toBe(true);
  expect(config.DEMO_RECEIVER_URL).toBeTruthy();
  const name = "Warehouse " + randomUUID().slice(0, 8);
  await registerOperator(page);
  const fixture = await createFixture(page, name);
  const { organizationId, destinationId } = fixture;
  const workspace = "/workspace/" + organizationId;
  const alertsPath = workspace + "/alerts";
  const detailPath = workspace + "/destinations/" + destinationId;

  await page.goto(alertsPath);
  await expect(
    page.getByRole("heading", { name: "Destination alerts", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No alerts yet.", { exact: true })).toBeVisible();
  await page.goto(workspace + "/destinations");
  const destinationLink = page.locator('a[href="' + detailPath + '"]').first();
  await destinationLink.focus();
  await page.keyboard.press("Enter");
  const chart = page.getByRole("region", { name: "Attempt history" });
  await expect(
    page.getByRole("heading", { name, exact: true, level: 1 }),
  ).toBeVisible();
  await expect(
    chart.getByText("No outbound attempts recorded in these seven days."),
  ).toBeVisible();

  await sendAndWait(page, fixture, 2, "failed");
  expect(await alertSummary(page, organizationId)).toEqual({
    openCount: 0,
    latest: null,
  });
  await sendAndWait(page, fixture, 1, "failed");
  const outage = await alertSummary(page, organizationId);
  expect(outage).toMatchObject({
    openCount: 1,
    latest: { kind: "outage", destinationId, name },
  });
  await sendAndWait(page, fixture, 1, "failed");
  expect(await alertSummary(page, organizationId)).toEqual(outage);

  // Bringing the workspace tab back into view checks for transitions immediately.
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  const alertsLink = page
    .getByRole("navigation", { name: "Organization" })
    .locator('a[href="' + alertsPath + '"]');
  await expect(alertsLink).toContainText("1 open", { timeout: 15_000 });
  await alertsLink.click();
  const history = page.getByRole("list", { name: "Alert history" });
  const rows = history.getByRole("listitem");
  await page.getByRole("link", { name: "Open outages", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(history).toContainText("Outage detected");
  await expect(
    history.getByRole("link", { name, exact: true }),
  ).toHaveAttribute("href", detailPath);

  await postCommand(page, "/api/organizations/" + organizationId, {
    action: "destination_update",
    id: destinationId,
    name,
    enabled: true,
    url: config.DEMO_RECEIVER_URL + "/hooks/success",
  });
  await sendAndWait(page, fixture, 1, "delivered");
  const recovery = await alertSummary(page, organizationId);
  expect(recovery).toMatchObject({
    openCount: 0,
    latest: { kind: "recovery", destinationId, name },
  });
  await sendAndWait(page, fixture, 1, "delivered");
  expect(await alertSummary(page, organizationId)).toEqual(recovery);

  await page.reload();
  await expect(
    page.getByText("No open outages.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "All alerts", exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Outage detected" })).toHaveCount(1);
  const recovered = rows.filter({ hasText: "Recovered" });
  await expect(recovered).toHaveCount(1);
  await recovered.getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(
    new URL(detailPath, config.RELAYHUB_BASE_URL).href,
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  const days = chart.getByRole("radio");
  await expect(days).toHaveCount(7);
  await chart.locator("label[for]").first().click();
  await expect(days.first()).toBeChecked();
  await days.first().focus();
  await page.keyboard.press("Space");
  await expect(days.first()).toBeChecked();
  await expect(chart.getByRole("status")).toContainText("No measurement");
  await page.keyboard.press("ArrowRight");
  await expect(days.nth(1)).toBeChecked();
  // Sum the seven UTC dates so a run crossing midnight verifies the same completed samples.
  let successes = 0;
  let failures = 0;
  const readout = chart.getByRole("status");
  for (const day of await days.all()) {
    await day.check();
    await expect(readout).toContainText(
      (await day.getAttribute("aria-label")) ?? "",
    );
    const totals = await readout.locator("dd").allTextContents();
    successes += Number(totals[0]);
    failures += Number(totals[1]);
    if (Number(totals[0]) + Number(totals[1]) > 0) {
      expect(totals[2]).toMatch(/\d[\d.,]* ms/);
    }
  }
  expect({ successes, failures }).toEqual({ successes: 2, failures: 4 });
  await chart.screenshot({
    path: testInfo.outputPath("destination-history-desktop.png"),
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Passa all’italiano" }).click();
  const italianChart = page.getByRole("region", {
    name: "Storico dei tentativi",
  });
  await expect(italianChart).toBeVisible();
  await expect(italianChart.getByRole("radio")).toHaveCount(7);
  for (const width of [320, 375, 430]) {
    await page.setViewportSize({ width, height: 812 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    const columns = italianChart
      .getByRole("region", { name: "Tentativi conclusi" })
      .locator("label");
    expect(
      (await columns.first().boundingBox())?.height,
    ).toBeGreaterThanOrEqual(100);
    await columns.first().click();
    await expect(italianChart.getByRole("radio").first()).toBeChecked();
    await columns.last().click();
    await expect(italianChart.getByRole("radio").last()).toBeChecked();
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await italianChart.screenshot({
    path: testInfo.outputPath("destination-history-mobile.png"),
  });
  await page.getByRole("button", { name: "Switch to English" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();

  // This operator can open their own workspace but cannot borrow the other tenant's destination ID.
  await registerOperator(page);
  const otherId = await postCommand(
    page,
    "/api/organizations",
    { name: "Other " + randomUUID() },
    201,
  );
  const denied = await page.request.get(
    "/api/organizations/" + organizationId + "/destination-alerts",
  );
  expect(denied.status()).toBe(404);
  await page.goto("/workspace/" + otherId + "/destinations/" + destinationId);
  await expect(
    page.getByRole("heading", { name: "Page unavailable" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(0);
});
