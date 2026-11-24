import { randomBytes, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import { eraseOrganization } from "../../apps/web/src/server/organization-data";

test.use({ trace: "off", screenshot: "off" });

async function register(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Organization fixture");
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
  return database().user.findUniqueOrThrow({ where: { email } });
}

async function seedDelivery(organizationId: string) {
  const db = database();
  const source = await db.webhookSource.create({
    data: { organizationId, name: "Store", secret: "unused" },
  });
  const destination = await db.webhookDestination.create({
    data: {
      organizationId,
      name: "Warehouse",
      url: "https://example.test",
      secret: "unused",
    },
  });
  const event = await db.webhookEvent.create({
    data: {
      organizationId,
      sourceId: source.id,
      externalId: randomUUID(),
      eventType: "order.created",
      payload: "",
      payloadHash: "",
      payloadSize: 0,
      correlationId: randomUUID(),
    },
  });
  const later = new Date(Date.now() + 60 * 60 * 1000);
  const delivery = await db.delivery.create({
    data: {
      organizationId,
      destinationId: destination.id,
      eventId: event.id,
      status: "retry_scheduled",
      nextAt: later,
      attempts: { create: { number: 1, outcome: "retry", httpStatus: 503 } },
      outbox: {
        create: { generation: 1, availableAt: later, publishAfter: later },
      },
    },
  });
  return { source, destination, delivery };
}

test("only the owner can delete a confirmed organization and its data", async ({
  page,
  browser,
  baseURL,
}) => {
  const config = settings();
  const databaseHost = new URL(config.DATABASE_URL).hostname;
  test.skip(
    !config.isDemo || !["127.0.0.1", "localhost"].includes(databaseHost),
    "Requires isolated demo services",
  );

  const db = database();
  const ownerEmail = randomUUID() + "@example.test";
  const adminEmail = randomUUID() + "@example.test";
  const organizationId = randomUUID();
  const otherId = randomUUID();
  const organizationName = "Delete this workspace";
  const url = "/workspace/" + organizationId + "/settings";
  const endpoint = "/api/organizations/" + organizationId;
  const adminContext = await browser.newContext({ baseURL });
  try {
    const owner = await register(page, ownerEmail);
    const adminPage = await adminContext.newPage();
    const admin = await register(adminPage, adminEmail);
    await db.organization.create({
      data: {
        id: organizationId,
        name: organizationName,
        members: {
          create: [
            { userId: owner.id, role: "owner" },
            { userId: admin.id, role: "admin" },
          ],
        },
        apiKeys: {
          create: { name: "Fixture", digest: randomBytes(32).toString("hex") },
        },
      },
    });
    // The same name in another organization must not make a token reusable.
    await db.organization.create({
      data: {
        id: otherId,
        name: organizationName,
        members: { create: { userId: owner.id, role: "owner" } },
      },
    });
    const data = await seedDelivery(organizationId);

    await page.goto(url);
    const panel = page.getByRole("region", { name: "Delete organization" });
    await panel.getByText("Review deletion", { exact: true }).click();
    const confirmation = panel.getByLabel("Organization name");
    await confirmation.fill("Wrong name");
    const submitted = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === endpoint,
    );
    await panel.getByRole("button", { name: "Delete permanently" }).click();
    const { csrfToken } = (await submitted).postDataJSON() as {
      csrfToken: string;
    };
    await expect(panel.getByRole("alert")).toHaveText(
      "Enter the organization name exactly as shown.",
    );

    const headers = { origin: config.RELAYHUB_BASE_URL };
    const command = {
      action: "organization_delete",
      confirmation: organizationName,
      csrfToken,
    };
    await adminPage.goto(url);
    await expect(
      adminPage.getByRole("heading", { name: "Settings" }),
    ).toBeVisible();
    await expect(
      adminPage.getByRole("region", { name: "Delete organization" }),
    ).toHaveCount(0);
    expect(
      (
        await adminPage.request.post(endpoint, { headers, data: command })
      ).status(),
    ).toBe(403);
    const otherEndpoint = "/api/organizations/" + otherId;
    expect(
      (
        await adminPage.request.post(otherEndpoint, { headers, data: command })
      ).status(),
    ).toBe(404);
    expect(
      (
        await page.request.post(otherEndpoint, { headers, data: command })
      ).status(),
    ).toBe(403);
    expect(
      await db.organization.count({
        where: { id: { in: [organizationId, otherId] } },
      }),
    ).toBe(2);

    await confirmation.fill(organizationName);
    await panel.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page).toHaveURL(/\/workspace$/);
    await expect(
      page.getByRole("heading", { name: "Organizations" }),
    ).toBeVisible();
    expect(
      await db.organization.findUnique({ where: { id: organizationId } }),
    ).toBeNull();
    expect(
      await db.organization.findUnique({ where: { id: otherId } }),
    ).not.toBeNull();
    expect(
      await db.organizationApiKey.count({ where: { organizationId } }),
    ).toBe(0);
    expect(
      await db.organizationMember.count({ where: { organizationId } }),
    ).toBe(0);
    expect(
      await db.webhookSource.count({ where: { id: data.source.id } }),
    ).toBe(0);
    expect(
      await db.webhookDestination.count({ where: { id: data.destination.id } }),
    ).toBe(0);
    expect(await db.webhookEvent.count({ where: { organizationId } })).toBe(0);
    expect(await db.delivery.count({ where: { id: data.delivery.id } })).toBe(
      0,
    );
    expect(
      await db.deliveryAttempt.count({
        where: { deliveryId: data.delivery.id },
      }),
    ).toBe(0);
    expect(
      await db.outboxEntry.count({ where: { deliveryId: data.delivery.id } }),
    ).toBe(0);
    expect(
      await db.user.count({ where: { id: { in: [owner.id, admin.id] } } }),
    ).toBe(2);
    expect((await adminPage.goto(url))?.status()).toBe(404);
  } finally {
    await adminContext.close();
    for (const id of [organizationId, otherId]) {
      if (await db.organization.findUnique({ where: { id } })) {
        await db.$transaction((tx) => eraseOrganization(tx, id));
      }
    }
    await db.user.deleteMany({
      where: { email: { in: [ownerEmail, adminEmail] } },
    });
  }
});
