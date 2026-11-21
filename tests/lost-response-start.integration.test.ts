import { randomUUID } from "node:crypto";
import { afterAll, expect, it, vi } from "vitest";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import {
  labEventId,
  startLostResponse,
} from "../apps/web/src/server/lost-response";

const fixture = vi.hoisted(() => ({
  organization: crypto.randomUUID(),
  source: crypto.randomUUID(),
  destination: crypto.randomUUID(),
  quota: "lost-response-test:" + crypto.randomUUID() + ":",
}));
vi.mock("@relayhub/shared/lost-response", async (original) => ({
  ...(await original<typeof import("@relayhub/shared/lost-response")>()),
  LAB_ORGANIZATION_ID: fixture.organization,
  LAB_SOURCE_ID: fixture.source,
  LAB_DESTINATION_ID: fixture.destination,
}));
vi.mock("@relayhub/db/rate-limit", async (original) => {
  const limits = await original<typeof import("@relayhub/db/rate-limit")>();
  return {
    // Use the real counter inside the supplied transaction, with two slots reserved for this test.
    withinLimit: (key, _limit, seconds, tx) =>
      limits.withinLimit(fixture.quota + key, 2, seconds, tx),
  } satisfies typeof limits;
});
vi.mock("@relayhub/db/events", async (original) => {
  const events = await original<typeof import("@relayhub/db/events")>();
  let arrivals = 0;
  let release = () => {};
  const bothReady = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    ...events,
    async storeEvent(...args) {
      // Hold the first insert until both requests have observed the run as new.
      arrivals++;
      if (arrivals === 2) {
        release();
      }
      await bothReady;
      return events.storeEvent(...args);
    },
  } satisfies typeof events;
});

if (!settings().isDemo) {
  throw new Error("Lost-response quota tests require the demo database.");
}
const db = database();
const isolatedQuota = { key: { startsWith: fixture.quota } };
const scope = { organizationId: fixture.organization };

afterAll(async () => {
  await db.$transaction([
    db.webhookEvent.deleteMany({ where: scope }),
    db.webhookDestination.deleteMany({ where: scope }),
    db.webhookSource.deleteMany({ where: scope }),
    db.organization.deleteMany({ where: { id: fixture.organization } }),
    db.requestCounter.deleteMany({ where: isolatedQuota }),
  ]);
  await db.$disconnect();
});

function newTicket() {
  const runId = randomUUID();
  const request = new Request("http://localhost/", {
    headers: { authorization: "Bearer " + randomUUID() },
  });
  const externalId = labEventId(request, runId);
  return {
    runId,
    externalId,
    start: () => startLostResponse(runId, externalId, randomUUID()),
  };
}

async function usedSlots() {
  const counts = await db.requestCounter.aggregate({
    where: isolatedQuota,
    _sum: { hits: true },
  });
  return counts._sum.hits ?? 0;
}

it("charges concurrent starts once, rolls back a new run at capacity, and still replays the accepted run", async () => {
  // Keep this run in one hourly window even if CI starts at the top of the hour.
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now());
  try {
    const shared = newTicket();
    const [first, duplicate] = await Promise.all([
      shared.start(),
      shared.start(),
    ]);
    expect(first.deliveryId).toBe(duplicate.deliveryId);
    expect(await usedSlots()).toBe(1);
    expect(await db.webhookEvent.count({ where: scope })).toBe(1);
    expect(await db.delivery.count({ where: scope })).toBe(1);

    await newTicket().start();
    expect(await usedSlots()).toBe(2);
    const refused = newTicket();
    await expect(refused.start()).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
    });
    expect(
      await db.webhookEvent.count({
        where: { ...scope, externalId: refused.externalId },
      }),
    ).toBe(0);
    expect(
      await db.delivery.count({
        where: { ...scope, event: { externalId: refused.externalId } },
      }),
    ).toBe(0);

    const replay = await shared.start();
    expect(replay.deliveryId).toBe(first.deliveryId);
    expect(await usedSlots()).toBe(2);
    expect(await db.webhookEvent.count({ where: scope })).toBe(2);
    expect(await db.delivery.count({ where: scope })).toBe(2);
  } finally {
    clock.mockRestore();
  }
}, 15000);
