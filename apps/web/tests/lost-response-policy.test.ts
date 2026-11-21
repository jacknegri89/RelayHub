import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { parseConfig } from "@relayhub/shared/config";
import {
  DestinationBlocked,
  destinationUrl,
} from "@relayhub/shared/destinations";
import {
  LAB_DESTINATION_ID,
  LAB_ORGANIZATION_ID,
  LAB_SOURCE_ID,
  lostResponseReceiverUrl,
} from "@relayhub/shared/lost-response";

const environment = {
  RELAYHUB_BASE_URL: "https://relay.example",
  DATABASE_URL: "postgresql://localhost/test",
  REDIS_URL: "redis://localhost",
  BETTER_AUTH_SECRET: "test".repeat(8),
  ACTIVE_KEY_ID: "test",
  ENCRYPTION_KEYS: "test:" + "af".repeat(32),
};
const scope = {
  organizationId: LAB_ORGANIZATION_ID,
  destinationId: LAB_DESTINATION_ID,
  sourceId: LAB_SOURCE_ID,
};

it("keeps the hosted receiver on the canonical HTTPS origin and the public DNS path", () => {
  const config = parseConfig(environment);
  const receiver = lostResponseReceiverUrl(config);
  expect(receiver).toBe(
    environment.RELAYHUB_BASE_URL + "/api/receiver/lost-response",
  );
  expect(destinationUrl(receiver, config, scope).isDemo).toBe(false);
  expect(() => destinationUrl(receiver, config)).toThrow(DestinationBlocked);
  for (const key of ["sourceId", "organizationId", "destinationId"] as const) {
    expect(() =>
      destinationUrl(receiver, config, { ...scope, [key]: randomUUID() }),
    ).toThrow(DestinationBlocked);
  }
  expect(() =>
    destinationUrl(environment.RELAYHUB_BASE_URL + "/other", config, scope),
  ).toThrow(DestinationBlocked);
});

it("allows the exact lab route on demo loopback or its fixed Compose service", () => {
  const demo = {
    ...environment,
    RELAYHUB_MODE: "demo",
    RELAYHUB_BASE_URL: "http://127.0.0.1:3139",
  };
  for (const override of ["", "http://web:3000"]) {
    const config = parseConfig({
      ...demo,
      DEMO_LOST_RESPONSE_ORIGIN: override,
    });
    const expected =
      (override || demo.RELAYHUB_BASE_URL) + "/api/receiver/lost-response";
    expect(lostResponseReceiverUrl(config)).toBe(expected);
    expect(destinationUrl(expected, config, scope).isDemo).toBe(true);
    expect(() => destinationUrl(expected, config)).toThrow(DestinationBlocked);
  }
  expect(() =>
    parseConfig({
      ...environment,
      DEMO_LOST_RESPONSE_ORIGIN: "http://web:3000",
    }),
  ).toThrow();
  expect(() =>
    parseConfig({ ...demo, DEMO_LOST_RESPONSE_ORIGIN: "http://other:3000" }),
  ).toThrow();
});
