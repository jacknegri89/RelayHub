import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import { GET } from "../apps/web/src/app/api/v1/[...path]/route";
import {
  ACTIVE_API_KEY_LIMIT,
  manageApiKey,
} from "../apps/web/src/server/organization-api-keys";

// Each test client has its own documentation-only IPv6 address and rate bucket.
vi.hoisted(() => {
  vi.stubEnv("TRUST_PROXY", "1");
});
if (!settings().isDemo) {
  throw new Error("REST integration tests require an isolated demo database.");
}
const db = database();
const org = randomUUID(),
  otherOrg = randomUUID(),
  owner = randomUUID(),
  viewer = randomUUID();
const source = randomUUID(),
  receiver = randomUUID(),
  foreignSource = randomUUID();
const events = Array.from({ length: 3 }, () => randomUUID())
  .sort()
  .reverse();
const deliveries = Array.from({ length: 3 }, () => randomUUID())
  .sort()
  .reverse();
const foreignEvent = randomUUID();
const foreignReceiver = randomUUID();
const foreignDelivery = randomUUID();
const addresses: string[] = [];
const keyIds: string[] = [];

beforeAll(async () => {
  await db.user.createMany({
    data: [owner, viewer].map((id) => ({
      id,
      name: "API test",
      email: id + "@relayhub.example",
    })),
  });
  await db.organization.create({
    data: {
      id: org,
      name: "API test",
      members: {
        create: [
          { userId: owner, role: "owner" },
          { userId: viewer, role: "viewer" },
        ],
      },
      sources: { create: { id: source, name: "Source", secret: "fixture" } },
      destinations: {
        create: {
          id: receiver,
          name: "Receiver",
          url: "https://example.test",
          secret: "fixture",
        },
      },
    },
  });
  await db.organization.create({
    data: {
      id: otherOrg,
      name: "Separate API test",
      destinations: {
        create: {
          id: foreignReceiver,
          name: "Other receiver",
          url: "https://example.test",
          secret: "fixture",
        },
      },
      members: { create: { userId: owner, role: "owner" } },
      sources: {
        create: { id: foreignSource, name: "Other source", secret: "fixture" },
      },
    },
  });
  const time = new Date();
  for (const [i, id] of [...events, foreignEvent].entries()) {
    const foreign = id === foreignEvent;
    let organizationId = org,
      sourceId = source;
    if (foreign) {
      organizationId = otherOrg;
      sourceId = foreignSource;
    }
    await db.webhookEvent.create({
      data: {
        id,
        organizationId,
        sourceId,
        receivedAt: time,
        eventType: "invoice.ready",
        externalId: "invoice-" + i,
        payloadSize: 24,
        payload: "sensitive fixture",
        payloadHash: "private hash",
        correlationId: randomUUID(),
      },
    });
  }
  for (const [index, id] of deliveries.entries()) {
    await db.delivery.create({
      data: {
        id,
        organizationId: org,
        eventId: events[index],
        destinationId: receiver,
        status: "delivered",
        createdAt: time,
        attemptCount: 1,
      },
    });
  }
  await db.deliveryAttempt.createMany({
    data: Array.from({ length: 24 }, (_, index) => ({
      deliveryId: deliveries[0],
      number: index + 1,
      outcome: "success",
      httpStatus: 204,
      durationMs: 2,
      finishedAt: time,
    })),
  });
  await db.delivery.update({
    where: { id: deliveries[0] },
    data: { attemptCount: 24 },
  });
  await db.delivery.create({
    data: {
      id: foreignDelivery,
      organizationId: otherOrg,
      eventId: foreignEvent,
      destinationId: foreignReceiver,
      status: "delivered",
    },
  });
});
afterAll(async () => {
  try {
    await db.$transaction([
      db.webhookEvent.deleteMany({
        where: { organizationId: { in: [org, otherOrg] } },
      }),
      db.webhookDestination.deleteMany({
        where: { organizationId: { in: [org, otherOrg] } },
      }),
      db.webhookSource.deleteMany({
        where: { organizationId: { in: [org, otherOrg] } },
      }),
      db.organization.deleteMany({ where: { id: { in: [org, otherOrg] } } }),
      db.user.deleteMany({ where: { id: { in: [owner, viewer] } } }),
      db.requestCounter.deleteMany({
        where: {
          OR: [
            ...addresses.map((ip) => ({
              key: { startsWith: "rest:ip:" + ip + ":" },
            })),
            ...keyIds.map((id) => ({
              key: { startsWith: "rest:key:" + id + ":" },
            })),
          ],
        },
      }),
    ]);
  } finally {
    vi.unstubAllEnvs();
    await db.$disconnect();
  }
});

async function createKey() {
  const result = await manageApiKey(org, owner, {
    action: "create",
    name: "Accounting",
  });
  if (!("secret" in result) || typeof result.secret !== "string") {
    throw new Error("One-time key missing");
  }
  keyIds.push(result.id);
  return { id: result.id, secret: result.secret };
}
function clientIp() {
  const ip =
    "2001:db8::" + randomUUID().slice(0, 4) + ":" + randomUUID().slice(0, 4);
  addresses.push(ip);
  return ip;
}
function read(path: string, secret?: string, ip = clientIp()) {
  const url = new URL("https://example.test/api/v1/" + path);
  const headers = new Headers({ "x-real-ip": ip });
  if (secret) {
    headers.set("authorization", "Bearer " + secret);
  }
  return GET(new Request(url, { headers }), {
    params: Promise.resolve({ path: url.pathname.split("/").slice(3) }),
  });
}

it("only owners issue/revoke, stores a digest, writes an audit record, and rejects a revoked key immediately", async () => {
  await expect(
    manageApiKey(org, viewer, { action: "create", name: "Denied" }),
  ).rejects.toMatchObject({ status: 403 });
  const key = await createKey();
  const row = await db.organizationApiKey.findUniqueOrThrow({
    where: { id: key.id },
  });
  expect(
    row.digest === createHash("sha256").update(key.secret).digest("hex"),
  ).toBe(true);
  expect(JSON.stringify(row).includes(key.secret)).toBe(false);
  await expect(
    manageApiKey(otherOrg, owner, { action: "revoke", id: key.id }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    manageApiKey(org, viewer, { action: "revoke", id: key.id }),
  ).rejects.toMatchObject({ status: 403 });
  expect((await read("events", key.secret)).status).toBe(200);
  await manageApiKey(org, owner, { action: "revoke", id: key.id });
  const denied = await read("events", key.secret);
  expect(denied.status).toBe(401);
  expect(denied.headers.get("www-authenticate")).toMatch(/Bearer/);
  expect(
    await db.auditLog.count({
      where: { organizationId: org, resourceId: key.id },
    }),
  ).toBe(2);
});

it("lists only tenant metadata, uses stable tied-time cursors and bounds attempt detail", async () => {
  const { secret } = await createKey();
  const first = await read("events?limit=2&sourceId=" + source, secret);
  expect(first.headers.get("cache-control")).toBe("no-store");
  const firstPage = await first.json();
  expect(firstPage.items.map((event: { id: string }) => event.id)).toEqual(
    events.slice(0, 2),
  );
  const second = await (
    await read(
      "events?limit=2&sourceId=" +
        source +
        "&cursor=" +
        encodeURIComponent(firstPage.nextCursor),
      secret,
    )
  ).json();
  expect(second.items.map((event: { id: string }) => event.id)).toEqual(
    events.slice(2),
  );
  expect(second.nextCursor).toBe(null);
  const event = await (await read("events/" + events[0], secret)).json();
  expect(Object.keys(event.item).sort()).toEqual(
    [
      "id",
      "sourceId",
      "externalId",
      "eventType",
      "payloadSize",
      "receivedAt",
    ].sort(),
  );
  expect((await read("events/" + foreignEvent, secret)).status).toBe(404);
  expect((await read("deliveries/" + foreignDelivery, secret)).status).toBe(
    404,
  );
  expect(
    (await (await read("events?sourceId=" + foreignSource, secret)).json())
      .items,
  ).toEqual([]);
  const filtered = await (
    await read(
      "deliveries?status=delivered&eventId=" +
        events[0] +
        "&destinationId=" +
        receiver,
      secret,
    )
  ).json();
  expect(filtered.items.map((delivery: { id: string }) => delivery.id)).toEqual(
    [deliveries[0]],
  );
  const detail = await (
    await read("deliveries/" + deliveries[0], secret)
  ).json();
  expect(detail.item.attempts).toHaveLength(20);
  expect(detail.item.attempts[0].number).toBe(24);
  expect(detail.item.attempts[19].number).toBe(5);
  expect(detail.item).not.toHaveProperty("leaseToken");
  expect(detail.item).not.toHaveProperty("url");
  for (const invalid of [
    "events?cursor=bad",
    "events?cursor=",
    "events?limit=101",
    "events?limit=0",
    "events?limit=2&limit=3",
    "deliveries?organizationId=" + otherOrg,
    "deliveries?status=unknown",
  ]) {
    expect((await read(invalid, secret)).status).toBe(422);
  }
});

it("serializes simultaneous issuance at the last available key slot", async () => {
  await db.organizationApiKey.createMany({
    data: Array.from({ length: ACTIVE_API_KEY_LIMIT - 1 }, (_, index) => ({
      organizationId: otherOrg,
      name: "Fixture " + index,
      digest: createHash("sha256").update(randomUUID()).digest("hex"),
    })),
  });
  const results = await Promise.allSettled(
    [1, 2].map((index) =>
      manageApiKey(otherOrg, owner, {
        action: "create",
        name: "Concurrent " + index,
      }),
    ),
  );
  const issued = results.filter(
    (result) => result.status === "fulfilled",
  ).length;
  expect(issued).toBe(1);
  const denied = results.find((result) => result.status === "rejected");
  expect(denied?.reason).toMatchObject({ status: 409, code: "api_key_limit" });
  expect(
    await db.organizationApiKey.count({ where: { organizationId: otherOrg } }),
  ).toBe(ACTIVE_API_KEY_LIMIT);
});

it("throttles repeated invalid credentials per IP and valid requests per key", async () => {
  const key = await createKey(),
    invalidIp = clientIp(),
    authorizedIp = clientIp();
  // Pre-fill this fixture's current and next bucket so a minute rollover does not affect the result.
  const bucket = Math.floor(Date.now() / 60000);
  for (const n of [bucket, bucket + 1]) {
    await db.requestCounter.createMany({
      data: [
        {
          key: "rest:ip:" + invalidIp + ":" + n,
          hits: 600,
          expiresAt: new Date((n + 1) * 60000),
        },
        {
          key: "rest:key:" + key.id + ":" + n,
          hits: 120,
          expiresAt: new Date((n + 1) * 60000),
        },
      ],
    });
  }
  const invalid = await read("events", undefined, invalidIp);
  expect(invalid.status).toBe(429);
  expect(invalid.headers.get("retry-after")).toBe("60");
  expect((await read("deliveries", key.secret, authorizedIp)).status).toBe(429);
  expect((await read("events", "wrong")).status).toBe(401);
});
