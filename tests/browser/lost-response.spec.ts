import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import {
  LAB_DESTINATION_ID,
  LAB_SOURCE_ID,
} from "@relayhub/shared/lost-response";
import type { LostResponseReport } from "../../apps/web/src/lost-response-report";

// The run's bearer belongs to this browser tab and must stay out of traces.
test.use({ hasTouch: true, trace: "off", screenshot: "off" });

test("a real retry reuses its delivery ID and saves one order", async ({
  page,
  context,
  baseURL,
}) => {
  test.skip(!settings().isDemo, "Requires an isolated worker and PostgreSQL");
  test.setTimeout(90_000);
  if (!baseURL) {
    throw new Error("The browser test requires an application origin");
  }
  const origin = new URL(baseURL).origin;
  const endpoint = "/api/lost-response";
  const browserErrors: string[] = [];
  const starts: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.name));
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === endpoint
    ) {
      starts.push(request.method());
    }
  });

  await context.addCookies([
    { name: "relayhub_lang", value: "it", url: origin },
  ]);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await page.getByRole("link", { name: "Prova una risposta persa" }).click();
  await expect(
    page.getByRole("heading", { name: "Prova una risposta persa" }),
  ).toBeVisible();
  expect(starts).toHaveLength(0);

  const started = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === endpoint,
  );
  await page.getByRole("button", { name: "Avvia la prova" }).tap();
  const accepted = await started;
  expect(accepted.status()).toBe(202);
  const run: LostResponseReport = await accepted.json();
  const db = database();
  const cleanupIds = [run.deliveryId];
  try {
    const headers = await accepted.request().allHeaders();
    const sameRun = await page.request.post(endpoint, {
      headers: { origin, authorization: headers.authorization },
      data: accepted.request().postDataJSON(),
    });
    expect(sameRun.status()).toBe(202);
    expect((await sameRun.json()).deliveryId).toBe(run.deliveryId);

    const runPath = endpoint + "/" + run.runId;
    const otherTab = await page.request.get(runPath, {
      headers: { authorization: "Bearer " + randomUUID() },
    });
    expect(otherTab.status()).toBe(404);

    const attempts = page.getByRole("region", {
      name: "Tentativi di consegna",
    });
    const rows = attempts.locator("details");
    await expect(rows).toHaveCount(2, { timeout: 45_000 });
    await expect(rows.nth(1).locator("summary")).toContainText("200", {
      timeout: 15_000,
    });
    await expect(
      page
        .getByRole("region", { name: "Destinatario" })
        .getByLabel("Ordini salvati"),
    ).toHaveText("1");

    for (const row of await rows.all()) {
      if ((await row.getAttribute("open")) === null) {
        await row.locator("summary").focus();
        await page.keyboard.press("Enter");
      }
    }
    for (const width of [320, 375, 1440]) {
      await page.setViewportSize({ width, height: 820 });
      for (const row of await rows.all()) {
        const deliveryId = row
          .locator("code")
          .filter({ hasText: run.deliveryId });
        await expect(deliveryId).toBeVisible();
        await expect(deliveryId).toHaveText(run.deliveryId);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
    }

    const success = await page.request.get(runPath, {
      headers: { authorization: headers.authorization },
    });
    expect(success.status()).toBe(200);
    const result: LostResponseReport = await success.json();
    expect(result.ordersSaved).toBe(1);
    expect(result.requestsReceived).toBe(2);
    expect(result.attempts).toMatchObject([
      {
        deliveryId: run.deliveryId,
        number: 1,
        outcome: "retry",
        httpStatus: null,
      },
      {
        deliveryId: run.deliveryId,
        number: 2,
        outcome: "success",
        httpStatus: 200,
      },
    ]);
    const orders = await db.lostResponseOrder.findMany({
      where: { deliveryId: run.deliveryId },
      select: { receipts: true, createdAt: true },
    });
    expect(orders).toHaveLength(1);
    expect(orders[0]!.receipts).toBe(2);
    // The first request committed the business effect before the worker lost its response.
    const firstFinished = result.attempts[0]!.finishedAt;
    expect(firstFinished).not.toBeNull();
    expect(orders[0]!.createdAt.getTime()).toBeLessThanOrEqual(
      Date.parse(firstFinished!),
    );
    const delivery = await db.delivery.findUniqueOrThrow({
      where: { id: run.deliveryId },
      select: { eventId: true, attemptCount: true },
    });
    expect(delivery.attemptCount).toBe(2);
    expect(
      await db.delivery.count({ where: { eventId: delivery.eventId } }),
    ).toBe(1);

    const resumed = page.waitForResponse(
      (response) => new URL(response.url()).pathname === runPath,
    );
    await page.reload();
    expect((await resumed).status()).toBe(200);
    await expect(rows).toHaveCount(2);
    expect(starts).toHaveLength(1);
    await page.getByRole("button", { name: "Switch to English" }).click();
    await expect(
      page.getByRole("heading", { name: "Try a lost response" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Receiver" }).getByLabel("Orders saved"),
    ).toHaveText("1");
    // Switching languages issues fresh form proof. The next start must wait until it is usable.
    const repeated = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === endpoint,
    );
    await page.getByRole("button", { name: "Start a new test" }).tap();
    const newResponse = await repeated;
    expect(newResponse.status()).toBe(202);
    const next: LostResponseReport = await newResponse.json();
    cleanupIds.push(next.deliveryId);
    expect(next.runId).not.toBe(run.runId);
    expect(next.deliveryId).not.toBe(run.deliveryId);
    const nextAttempts = page
      .getByRole("region", { name: "Delivery attempts" })
      .locator("details");
    await expect(nextAttempts.nth(1).locator("summary")).toContainText("200", {
      timeout: 45_000,
    });
    expect(browserErrors).toEqual([]);
  } finally {
    await db.webhookEvent.deleteMany({
      where: {
        sourceId: LAB_SOURCE_ID,
        deliveries: {
          some: { destinationId: LAB_DESTINATION_ID, id: { in: cleanupIds } },
        },
      },
    });
  }
});
