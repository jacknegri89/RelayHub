import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { database } from "@relayhub/db";
import { storeEvent } from "@relayhub/db/events";
import { withinLimit } from "@relayhub/db/rate-limit";
import { settings } from "@relayhub/shared/config";
import { signature } from "@relayhub/shared/protocol";
import { claim } from "../apps/worker/src/delivery";
import { sampleEvent, submitSigned } from "../scripts/demo-fixtures";

const config = settings();
if (!config.isDemo || !config.DEMO_RECEIVER_URL) {
  throw new Error("Integration tests require an isolated demo environment.");
}
const receiver = config.DEMO_RECEIVER_URL;
const db = database();
let ownerCookie: string;
let viewerCookie: string;
let viewerAccountId: string;
let org: string;
let source: { id: string; secret: string };
const routes = new Map<string, string>();

async function post(
  path: string,
  body: object,
  cookie = "",
  origin = config.RELAYHUB_BASE_URL,
) {
  return fetch(config.RELAYHUB_BASE_URL + path, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie },
    body: JSON.stringify(body),
  });
}

async function ok(response: Response, status = 200) {
  const value = await response.json();
  expect(
    response.status,
    JSON.stringify({ error: value.error, code: value.code }),
  ).toBe(status);
  return value;
}

async function register() {
  const page = await fetch(config.RELAYHUB_BASE_URL + "/register");
  const markup = await page.text();
  const formProof = /name="formProof" value="([^"]+)"/.exec(markup)?.[1];
  if (!formProof) {
    throw new Error("Registration form proof is missing");
  }
  await delay(650);
  const email = randomUUID() + "@relayhub.example";
  const password = randomUUID();
  const response = await post("/api/auth/sign-up/email", {
    name: "Integration Operator",
    email,
    password,
    formProof,
    website: "",
  });
  const registered = await ok(response);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  expect(cookie).toBeTruthy();
  return { cookie, accountId: registered.user.id };
}

function manage(command: object, cookie = ownerCookie, organization = org) {
  return post("/api/organizations/" + organization, command, cookie);
}

async function sendEvent(type: string) {
  const id = randomUUID();
  return ok(
    await submitSigned(source.id, source.secret, id, sampleEvent(type, id)),
    202,
  );
}

async function delivered(eventId: string, status = "delivered") {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const row = await db.delivery.findFirst({
      where: { eventId, organizationId: org },
      include: { attempts: { orderBy: { number: "asc" } }, outbox: true },
    });
    if (row?.status === status) {
      return row;
    }
    await delay(200);
  }
  throw new Error("Delivery did not reach " + status);
}

beforeAll(async () => {
  const [owner, viewer] = await Promise.all([register(), register()]);
  ownerCookie = owner.cookie;
  viewerCookie = viewer.cookie;
  viewerAccountId = viewer.accountId;
  org = (
    await ok(
      await post(
        "/api/organizations",
        { name: "Integration " + randomUUID() },
        ownerCookie,
      ),
      201,
    )
  ).id;
  source = await ok(
    await manage({ action: "source_create", name: "Integration source" }),
  );
  for (const mode of ["success", "transient", "busy", "permanent"]) {
    const { id } = await ok(
      await manage({
        action: "destination_create",
        name: mode,
        url: receiver + "/hooks/" + mode,
      }),
    );
    routes.set(mode, id);
    await ok(
      await manage({
        action: "route_save",
        sourceId: source.id,
        destinationId: id,
        eventType: "demo." + mode,
      }),
    );
  }
}, 30_000);

afterAll(async () => {
  await db.$disconnect();
});

describe("RelayHub with PostgreSQL, Redis and HTTP", () => {
  it("enforces an atomic shared request budget across concurrent callers", async () => {
    const key = "integration:" + randomUUID();
    const results = await Promise.all(
      Array.from({ length: 12 }, () => withinLimit(key, 4, 3600)),
    );
    expect(results.filter(Boolean)).toHaveLength(4);
  });
  it("checks signatures, timestamps, content type and raw payload bytes before storage", async () => {
    const id = randomUUID();
    const body = sampleEvent("demo.success", id);
    const endpoint = config.RELAYHUB_BASE_URL + "/api/webhooks/" + source.id;
    const now = String(Math.floor(Date.now() / 1000));
    const expired = String(Number(now) - 3600);
    const baseHeaders = {
      "content-type": "application/json",
      "x-relayhub-event-id": id,
      "x-relayhub-timestamp": now,
    };
    async function request(headers: Record<string, string>, payload = body) {
      return fetch(endpoint, {
        method: "POST",
        headers: { ...baseHeaders, ...headers },
        body: payload,
      });
    }
    expect((await request({})).status).toBe(401);
    expect(
      (await request({ "x-relayhub-signature": "v1=" + "f".repeat(64) }))
        .status,
    ).toBe(401);
    expect(
      (
        await request(
          {
            "x-relayhub-signature": signature(
              source.secret,
              now,
              Buffer.from(body),
            ),
          },
          body + " ",
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await request({
          "x-relayhub-timestamp": expired,
          "x-relayhub-signature": signature(
            source.secret,
            expired,
            Buffer.from(body),
          ),
        })
      ).status,
    ).toBe(401);
    expect((await request({ "content-type": "text/plain" })).status).toBe(415);
    expect((await submitSigned(source.id, source.secret, id, "{")).status).toBe(
      422,
    );
    const large = "x".repeat(config.PAYLOAD_LIMIT_BYTES + 1);
    expect(
      (await submitSigned(source.id, source.secret, id, large)).status,
    ).toBe(413);
    expect(
      await db.webhookEvent.count({
        where: { organizationId: org, externalId: id },
      }),
    ).toBe(0);
  });

  it("deduplicates simultaneous requests and rejects reused IDs or signatures", async () => {
    const id = randomUUID();
    const body = sampleEvent("demo.success", id);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        submitSigned(source.id, source.secret, id, body),
      ),
    ).catch((error: unknown) => {
      throw new Error("Concurrent ingress request failed", { cause: error });
    });
    expect(results.map((result) => result.status).sort()).toEqual([
      200, 200, 200, 200, 200, 200, 200, 202,
    ]);
    const responses = await Promise.all(results.map((result) => result.json()));
    expect(new Set(responses.map((item) => item.eventId)).size).toBe(1);
    const eventId = responses[0].eventId;
    expect(
      await db.webhookEvent.count({
        where: { organizationId: org, externalId: id },
      }),
    ).toBe(1);
    expect(
      await db.delivery.count({ where: { eventId, organizationId: org } }),
    ).toBe(1);
    const conflict = await submitSigned(
      source.id,
      source.secret,
      id,
      sampleEvent("demo.success"),
    );
    expect(conflict.status).toBe(409);
    await conflict.json();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const freshBody = sampleEvent("demo.success");
    const signedHeaders = {
      "content-type": "application/json",
      "x-relayhub-timestamp": timestamp,
      "x-relayhub-signature": signature(
        source.secret,
        timestamp,
        Buffer.from(freshBody),
      ),
    };
    for (const expectedStatus of [202, 409]) {
      const response = await fetch(
        config.RELAYHUB_BASE_URL + "/api/webhooks/" + source.id,
        {
          method: "POST",
          headers: { ...signedHeaders, "x-relayhub-event-id": randomUUID() },
          body: freshBody,
        },
      );
      expect(response.status).toBe(expectedStatus);
      await response.json();
    }
    const laterTimestamp = String(Number(timestamp) + 1);
    const laterSignature = signature(
      source.secret,
      laterTimestamp,
      Buffer.from(body),
    );
    const laterHeaders = {
      ...signedHeaders,
      "x-relayhub-timestamp": laterTimestamp,
      "x-relayhub-signature": laterSignature,
    };
    for (const [externalId, expectedStatus] of [
      [id, 200],
      [randomUUID(), 409],
    ] as const) {
      const response = await fetch(
        config.RELAYHUB_BASE_URL + "/api/webhooks/" + source.id,
        {
          method: "POST",
          headers: { ...laterHeaders, "x-relayhub-event-id": externalId },
          body,
        },
      );
      expect(response.status).toBe(expectedStatus);
      await response.json();
    }
    const row = await delivered(eventId);
    expect(row.attempts.map((item) => item.httpStatus)).toEqual([200]);
    expect(row.outbox).toBeNull();
    const raw = await db.webhookEvent.findUniqueOrThrow({
      where: { id: eventId, organizationId: org },
    });
    expect(raw.payload).not.toContain("DEMO-100");
  }, 40_000);

  it("retries 500 twice before succeeding and respects Retry-After on 429", async () => {
    const [transient, busy] = await Promise.all([
      sendEvent("demo.transient"),
      sendEvent("demo.busy"),
    ]);
    const [transientRow, busyRow] = await Promise.all([
      delivered(transient.eventId),
      delivered(busy.eventId),
    ]);
    expect(transientRow.attempts.map((item) => item.httpStatus)).toEqual([
      500, 500, 200,
    ]);
    expect(busyRow.attempts.map((item) => item.httpStatus)).toEqual([429, 200]);
    const scheduled = busyRow.attempts[0].retryAt?.getTime() ?? 0;
    const ended = busyRow.attempts[0].finishedAt?.getTime() ?? 0;
    expect(scheduled - ended).toBeGreaterThanOrEqual(2000);
  }, 40_000);

  it("supports an audited manual retry with the same delivery ID", async () => {
    const event = await sendEvent("demo.permanent");
    const failed = await delivered(event.eventId, "failed");
    expect(failed.attempts.map((item) => item.httpStatus)).toEqual([400]);
    await ok(
      await manage({
        action: "destination_update",
        id: routes.get("permanent"),
        name: "permanent",
        url: receiver + "/hooks/success",
        enabled: true,
      }),
    );
    const retries = await Promise.all([
      manage({ action: "delivery_retry", id: failed.id }),
      manage({ action: "delivery_retry", id: failed.id }),
    ]);
    expect(retries.map((result) => result.status).sort()).toEqual([200, 409]);
    const row = await delivered(event.eventId);
    expect(row.id).toBe(failed.id);
    expect(row.attempts.map((item) => item.httpStatus)).toEqual([400, 200]);
    expect(
      await db.auditLog.count({
        where: {
          organizationId: org,
          action: "delivery_retry",
          resourceId: row.id,
        },
      }),
    ).toBe(1);
  }, 40_000);

  it("blocks cross-tenant IDs, viewers, cross-origin writes and private destination URLs", async () => {
    const path = "/workspace/" + org + "/sources";
    expect(
      (
        await fetch(config.RELAYHUB_BASE_URL + path, {
          headers: { cookie: viewerCookie },
        })
      ).status,
    ).toBe(404);
    const other = await ok(
      await post("/api/organizations", { name: "Other" }, viewerCookie),
      201,
    );
    expect(
      (
        await manage(
          { action: "source_rotate", id: source.id },
          viewerCookie,
          other.id,
        )
      ).status,
    ).toBe(404);
    await ok(
      await manage({
        action: "member_save",
        accountId: viewerAccountId,
        role: "viewer",
      }),
    );
    expect(
      (await manage({ action: "source_rotate", id: source.id }, viewerCookie))
        .status,
    ).toBe(403);
    const page = await fetch(config.RELAYHUB_BASE_URL + path, {
      headers: { cookie: viewerCookie },
    });
    expect(page.status).toBe(200);
    expect(await page.text()).not.toContain(source.secret);
    const wrongOrigin = await post(
      "/api/organizations",
      { name: "bad" },
      ownerCookie,
      "https://unrelated.example",
    );
    expect(wrongOrigin.status).toBe(403);
    expect(
      (
        await manage({
          action: "destination_create",
          name: "blocked",
          url: "https://127.0.0.1",
        })
      ).status,
    ).toBe(422);
  });

  it("keeps committed outbox records while Redis is paused and delivers after it resumes", async () => {
    const redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 1,
      commandTimeout: 2000,
    });
    try {
      await redis.call("CLIENT", "PAUSE", "4500", "ALL");
      const event = await sendEvent("demo.success");
      const row = await db.delivery.findFirstOrThrow({
        where: { organizationId: org, eventId: event.eventId },
        include: { outbox: true },
      });
      expect(row.outbox?.deliveryId).toBe(row.id);
      expect(row.attemptCount).toBe(0);
      expect((await delivered(event.eventId)).attemptCount).toBe(1);
    } finally {
      redis.disconnect();
    }
  }, 40_000);

  it("fences concurrent claims and recovers an expired lease", async () => {
    const sourceRow = await db.webhookSource.findUniqueOrThrow({
      where: { id: source.id, organizationId: org },
    });
    const event = await storeEvent({
      sourceId: source.id,
      organizationId: org,
      sourceSecret: sourceRow.secret,
      externalId: randomUUID(),
      eventType: "demo.lease",
      body: Buffer.from(sampleEvent("demo.lease")),
      correlationId: randomUUID(),
    });
    expect(event.kind).toBe("accepted");
    if (event.kind !== "accepted") {
      throw new Error("Test event was not created");
    }
    const destinationId = routes.get("success");
    if (!destinationId) {
      throw new Error("Demo destination is missing");
    }
    const row = await db.delivery.create({
      data: {
        eventId: event.eventId,
        organizationId: org,
        destinationId,
        outbox: {
          create: {
            generation: 1,
            availableAt: new Date(),
            publishAfter: new Date(Date.now() + 60_000),
          },
        },
      },
      select: { id: true },
    });
    const claimed = await Promise.all(
      Array.from({ length: 12 }, () =>
        claim({ deliveryId: row.id, generation: 1 }),
      ),
    );
    expect(claimed.filter(Boolean)).toHaveLength(1);
    await db.delivery.update({
      where: { id: row.id },
      data: { leaseExpiresAt: new Date(0) },
    });
    const final = await delivered(event.eventId);
    expect(final.attempts.map((item) => item.outcome)).toEqual([
      "lease_expired",
      "success",
    ]);
  }, 40_000);
});
