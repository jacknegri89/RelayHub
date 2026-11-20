import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";

test.use({ hasTouch: true });
const DAY_MS = 86_400_000;

async function registerViewer(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Overview viewer");
  await page.getByLabel("Email", { exact: true }).fill(email);
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

async function seedWeek(organizationId: string, email: string) {
  const db = database();
  const user = await db.user.findUniqueOrThrow({
    where: { email },
    select: { id: true },
  });
  const destinationId = randomUUID();
  const sourceId = randomUUID();
  await db.organization.create({
    data: {
      id: organizationId,
      name: "Reporting workspace",
      members: { create: { userId: user.id, role: "viewer" } },
      sources: {
        create: { id: sourceId, name: "Online shop", secret: "unused" },
      },
      destinations: {
        create: {
          id: destinationId,
          name: "Warehouse",
          url: "https://example.test",
          secret: "unused",
        },
      },
    },
  });
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  // Historical rollups survive removal of the individual attempts.
  const history = [
    [1510, 6],
    [2340, 1],
    [0, 0],
    [1730, 9],
    [1980, 4],
    [2550, 7],
  ];
  await db.destinationDailyStat.createMany({
    data: history.map(([successCount, failureCount], index) => ({
      organizationId,
      destinationId,
      successCount,
      failureCount,
      day: new Date(today.getTime() - (history.length - index) * DAY_MS),
    })),
  });
  const event = await db.webhookEvent.create({
    data: {
      organizationId,
      sourceId,
      externalId: "store-7204",
      eventType: "order.confirmed",
      payload: "",
      payloadHash: "",
      payloadSize: 0,
      correlationId: randomUUID(),
    },
  });
  const finishedAt = new Date();
  await db.delivery.create({
    data: {
      organizationId,
      destinationId,
      eventId: event.id,
      status: "delivered",
      finishedAt,
      durationMs: 120,
      attemptCount: 1,
      attempts: {
        create: {
          number: 1,
          outcome: "success",
          httpStatus: 204,
          durationMs: 120,
          finishedAt,
        },
      },
    },
  });
  return event.id;
}

test("a viewer can inspect real trends with a keyboard or touch from 320px to desktop", async ({
  page,
}, testInfo) => {
  test.skip(!settings().isDemo, "Requires an isolated demo workspace");
  const db = database();
  const organizationId = randomUUID();
  const email = randomUUID() + "@relayhub.example";
  const workspace = "/workspace/" + organizationId;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await registerViewer(page, email);
    const eventId = await seedWeek(organizationId, email);
    await page.goto(workspace);
    const chart = page.getByRole("region", { name: "Attempt trend" });
    const days = chart.getByRole("radio");
    await expect(days).toHaveCount(7);
    await expect(days.last()).toBeChecked();
    await expect(
      page.getByRole("link", { name: /Enabled sources/ }),
    ).toHaveAttribute("href", workspace + "/sources");
    await expect(
      page.getByRole("link", { name: /Enabled destinations/ }),
    ).toHaveAttribute("href", workspace + "/destinations");
    await expect(
      page.getByRole("link", { name: "order.confirmed" }),
    ).toHaveAttribute("href", workspace + "/events/" + eventId);
    const timings = page.getByRole("region", { name: "HTTP response times" });
    await expect(timings.getByText("120 ms", { exact: true })).toHaveCount(3);

    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 920 });
      await chart.getByRole("button", { name: "All", exact: true }).tap();
      await days.first().tap();
      await expect(
        chart.getByRole("status").getByText("1,516", { exact: true }),
      ).toBeVisible();
      await expect(chart.locator("polyline")).toHaveCount(3);
      const allPoints = await chart
        .locator('polyline[data-series="failed"]')
        .getAttribute("points");
      await chart.getByRole("button", { name: "Failed", exact: true }).tap();
      await expect(chart.locator("polyline")).toHaveCount(1);
      await expect(chart.locator("polyline")).not.toHaveAttribute(
        "points",
        allPoints!,
      );
      await expect(
        chart.getByRole("status").getByText("6", { exact: true }),
      ).toBeVisible();
      await days.first().focus();
      await page.keyboard.press("ArrowRight");
      await expect(days.nth(1)).toBeChecked();
      await expect(
        chart.getByRole("status").getByText("1", { exact: true }),
      ).toBeVisible();
      await chart
        .getByRole("button", { name: "Successful", exact: true })
        .tap();
      await expect(
        chart.getByRole("status").getByText("2,340", { exact: true }),
      ).toBeVisible();
      await chart.getByRole("button", { name: "All", exact: true }).tap();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      if (width === 375 || width === 1440) {
        await chart.screenshot({
          path: testInfo.outputPath("overview-chart-" + width + ".png"),
        });
      }
    }
    await page.getByRole("button", { name: "Passa all’italiano" }).click();
    const italianChart = page.getByRole("region", {
      name: "Andamento dei tentativi",
    });
    await expect(italianChart.getByRole("radio")).toHaveCount(7);
    await italianChart
      .getByRole("button", { name: "Falliti", exact: true })
      .click();
    await italianChart.getByRole("radio").first().check();
    await expect(
      italianChart.getByRole("status").getByText("6", { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    const where = { organizationId };
    await db.$transaction([
      db.webhookEvent.deleteMany({ where }),
      db.webhookDestination.deleteMany({ where }),
      db.webhookSource.deleteMany({ where }),
      db.organization.deleteMany({ where: { id: organizationId } }),
      db.user.deleteMany({ where: { email } }),
    ]);
  }
});
