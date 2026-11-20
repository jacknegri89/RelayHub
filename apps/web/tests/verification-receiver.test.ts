import { randomBytes } from "node:crypto";
import { beforeAll, expect, it, vi } from "vitest";
import { signature } from "@relayhub/shared/protocol";
import { settings } from "@relayhub/shared/config";
import { POST } from "../src/app/api/receiver/verify/route";

vi.mock("@relayhub/shared/config", () => ({ settings: vi.fn() }));
const key = randomBytes(32).toString("hex");
beforeAll(() => {
  vi.mocked(settings).mockReturnValue({
    isDemo: false,
    VERIFICATION_RECEIVER_SECRET: key,
    WEBHOOK_WINDOW_SECONDS: 300,
    PAYLOAD_LIMIT_BYTES: 262144,
  } as ReturnType<typeof settings>);
});

function deliver(type: string, relayHubTest: boolean, signingKey = key) {
  const id = "test-receiver-check";
  const body = JSON.stringify({ type, relayHubTest, id });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers = {
    "content-type": "application/json",
    "x-relayhub-event-id": id,
    "x-relayhub-timestamp": timestamp,
    "x-relayhub-signature": signature(signingKey, timestamp, Buffer.from(body)),
  };
  return POST(
    new Request("https://example.test/api/receiver/verify", {
      method: "POST",
      headers,
      body,
    }),
  );
}

it("rejects the signed failure rehearsal and accepts ordinary signed deliveries", async () => {
  expect((await deliver("relayhub.verify.reject", true)).status).toBe(422);
  expect((await deliver("relayhub.verify.reject", false)).status).toBe(204);
  expect((await deliver("relayhub.test", true)).status).toBe(204);
});

it("checks the signature before revealing a test outcome", async () => {
  expect(
    (await deliver("relayhub.verify.reject", true, "incorrect")).status,
  ).toBe(401);
});
