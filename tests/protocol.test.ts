import { describe, expect, it } from "vitest";
import { runtimeDatabaseUrl } from "@relayhub/db/connection";
import { can } from "@relayhub/shared/access";
import { parseConfig } from "@relayhub/shared/config";
import { destinationUrl, publicAddress } from "@relayhub/shared/destinations";
import { canTransition } from "@relayhub/shared/delivery-states";
import {
  deliverySignature,
  deliverySignatureMatches,
  eventSchema,
  parseJson,
  PayloadTooLarge,
  readBody,
  signature,
  signatureMatches,
  validTimestamp,
} from "@relayhub/shared/protocol";
import { classifyStatus, retryDelay } from "@relayhub/shared/retry";
import { approvedAddress } from "../apps/worker/src/send";

const timestamp = "1700000000";
const body = Buffer.from('{ "type": "order.created" }');

describe("database transport", () => {
  it.each(["prefer", "require", "verify-ca", "verify-full"])(
    "uses explicit certificate and host verification for %s",
    (mode) => {
      const url = new URL(
        runtimeDatabaseUrl(
          "postgres://db.example/test?channel_binding=require&sslmode=" + mode,
        ),
      );
      expect(url.searchParams.get("sslmode")).toBe("verify-full");
      expect(url.searchParams.get("channel_binding")).toBe("require");
    },
  );
  it("requires TLS for remote hosts even without a mode and preserves local Compose", () => {
    expect(runtimeDatabaseUrl("postgres://db.example/test")).toContain(
      "sslmode=verify-full",
    );
    expect(runtimeDatabaseUrl("postgres://postgres/test")).toBe(
      "postgres://postgres/test",
    );
    expect(() =>
      runtimeDatabaseUrl(
        "postgres://localhost/test?host=db.example&sslmode=disable",
      ),
    ).toThrow("verify-full");
    expect(() =>
      runtimeDatabaseUrl("postgres://db.example/test?sslmode=no-verify"),
    ).toThrow("verify-full");
    expect(() => runtimeDatabaseUrl("invalid input")).toThrow(
      /^Invalid DATABASE_URL$/,
    );
  });
});

describe("webhook protocol", () => {
  it("matches the HMAC-SHA256 v1 reference vector", () => {
    const expected =
      "v1=b8826c10e08064a9c00dcc1cba34412807139df109fcfcd171bfc9cffc4a3c35";
    expect(signature("secret", timestamp, body)).toBe(expected);
  });
  it("rejects changed raw bytes and invalid signatures", () => {
    const signed = signature("secret", timestamp, body);
    expect(
      signatureMatches(
        "secret",
        timestamp,
        Buffer.from('{"type":"order.created"}'),
        signed,
      ),
    ).toBe(false);
    expect(signatureMatches("secret", timestamp, body, "v1=123")).toBe(false);
    expect(signatureMatches("secret", timestamp, body, signed)).toBe(true);
  });
  it("enforces both edges of the timestamp window", () => {
    expect(validTimestamp(timestamp, 300, 1700000300000)).toBe(true);
    expect(validTimestamp(timestamp, 300, 1700000301000)).toBe(false);
    expect(validTimestamp(timestamp, 300, 1699999699000)).toBe(false);
  });
  it("binds the destination delivery and sender event IDs to the outbound body", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const event = "order.42";
    const expected =
      "v2=6249fa16ef67d181c54ce3d5e33f1e094d0353b312fd5f5efb5d163e76b1e0f9";
    expect(deliverySignature("secret", timestamp, id, event, body)).toBe(
      expected,
    );
    expect(
      deliverySignatureMatches("secret", timestamp, id, event, body, expected),
    ).toBe(true);
    for (const [deliveryId, eventId, bytes] of [
      [id.replace(/1$/, "2"), event, body],
      [id, "order.43", body],
      [id, event, Buffer.from("{}")],
    ] as const) {
      expect(
        deliverySignatureMatches(
          "secret",
          timestamp,
          deliveryId,
          eventId,
          bytes,
          expected,
        ),
      ).toBe(false);
    }
    expect(
      deliverySignatureMatches(
        "secret",
        timestamp,
        id,
        event,
        body,
        signature("secret", timestamp, body),
      ),
    ).toBe(false);
  });
  it("bounds streamed bodies even without Content-Length", async () => {
    const request = new Request("https://relayhub.example", {
      method: "POST",
      body,
    });
    await expect(readBody(request, 10)).rejects.toBeInstanceOf(PayloadTooLarge);
  });
  it("requires a valid UTF-8 JSON object with an event type", () => {
    expect(eventSchema.safeParse(parseJson(body)).success).toBe(true);
    expect(eventSchema.safeParse({ type: "<invalid>" }).success).toBe(false);
    expect(() => parseJson(Buffer.from([0xff]))).toThrow();
  });
});

describe("routing policy", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "100.64.0.1",
    "169.254.1.2",
    "192.0.2.1",
    "224.0.0.1",
    "240.1.2.3",
    "::1",
    "fc00::1",
    "::ffff:8.8.8.8",
    "fe80::1",
    "2001:db8::1",
    "ff02::1",
  ])("blocks ineligible address %s", (address) => {
    expect(publicAddress(address)).toBe(false);
  });
  it("blocks a batch of DNS results when any address is ineligible", async () => {
    await expect(
      approvedAddress("receiver.example", async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ]),
    ).rejects.toThrow("ineligible");
  });
  it("retains the approved address and family", async () => {
    const resolved = await approvedAddress("receiver.example", async () => [
      { address: "2606:4700::1111", family: 6 },
    ]);
    expect(resolved).toEqual({ address: "2606:4700::1111", family: 6 });
  });
  it("normalizes the hostname allowlist and forbids demo HTTP in production", () => {
    const env = {
      RELAYHUB_BASE_URL: "https://relayhub.example",
      DATABASE_URL: "postgresql://localhost/test",
      REDIS_URL: "redis://localhost",
      BETTER_AUTH_SECRET: "e".repeat(32),
      ACTIVE_KEY_ID: "v1",
      ENCRYPTION_KEYS: "v1:" + "ab".repeat(32),
      DESTINATION_HOSTS: "Receiver.Example, api.example ",
      RELAYHUB_PREVIOUS_ORIGIN: "https://previous.example",
      VERIFICATION_RECEIVER_SECRET: "e".repeat(32),
    };
    expect([...parseConfig(env).hosts]).toEqual([
      "receiver.example",
      "api.example",
    ]);
    expect(() =>
      parseConfig({ ...env, DEMO_RECEIVER_URL: "http://127.0.0.1:3001" }),
    ).toThrow();
    const config = parseConfig(env);
    expect(
      destinationUrl("https://previous.example/api/receiver/verify", config)
        .isVerificationReceiver,
    ).toBe(true);
    expect(() =>
      destinationUrl("https://previous.example/api/health/ready", config),
    ).toThrow();
    expect(() =>
      parseConfig({
        ...env,
        RELAYHUB_PREVIOUS_ORIGIN: "https://previous.example/path",
      }),
    ).toThrow();
  });
});

describe("delivery decisions", () => {
  it("enforces claim, finish and manual retry state transitions", () => {
    expect(canTransition("pending", "queued")).toBe(true);
    expect(canTransition("queued", "delivering")).toBe(true);
    expect(canTransition("delivering", "retry_scheduled")).toBe(true);
    expect(canTransition("delivering", "delivered")).toBe(true);
    expect(canTransition("failed", "pending")).toBe(true);
    expect(canTransition("cancelled", "pending")).toBe(false);
    expect(canTransition("delivered", "delivering")).toBe(false);
  });
  it.each([
    [204, "success"],
    [302, "permanent"],
    [400, "permanent"],
    [429, "retry"],
    [502, "retry"],
  ])("classifies HTTP %d as %s", (status, outcome) => {
    expect(classifyStatus(status)).toBe(outcome);
  });
  it("bounds exponential jitter and Retry-After", () => {
    expect(retryDelay(2, undefined, 0, 0)).toBe(1000);
    expect(retryDelay(2, "3", 0, 1)).toBe(3000);
    expect(retryDelay(20, "999999", 0, 1)).toBe(900000);
  });
  it("restricts the viewer to read access and reserves membership changes for owners", () => {
    expect(can("viewer", "read")).toBe(true);
    expect(can("viewer", "configure")).toBe(false);
    expect(can("admin", "manage_members")).toBe(false);
    expect(can("owner", "manage_members")).toBe(true);
  });
});
