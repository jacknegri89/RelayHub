import { once } from "node:events";
import { createServer } from "node:http";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { settings } from "@relayhub/shared/config";
import { send } from "../../worker/src/send";

vi.mock("@relayhub/shared/config", () => ({ settings: vi.fn() }));

let redirectFollowed = false;
let origin: string;
const server = createServer((request, response) => {
  if (request.url === "/hooks/permanent") {
    response.writeHead(307, { location: "/unconfigured" }).end();
    return;
  }
  if (request.url === "/hooks/success") {
    // A receiver can send an ongoing response body after acknowledging the request.
    response.writeHead(200, { "content-type": "application/octet-stream" });
    response.write(Buffer.alloc(8192));
    return;
  }
  if (request.url === "/hooks/timeout") {
    return;
  }
  redirectFollowed = true;
  response.writeHead(204).end();
});

beforeAll(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected loopback test port");
  }
  origin = "http://127.0.0.1:" + address.port;
  vi.mocked(settings).mockReturnValue({
    isDemo: true,
    DEMO_RECEIVER_URL: origin,
  } as ReturnType<typeof settings>);
});

afterAll(async () => {
  const closed = once(server, "close");
  server.close();
  server.closeAllConnections();
  await closed;
});

it("records a redirect without forwarding the delivery", async () => {
  const result = await send(
    origin + "/hooks/permanent",
    Buffer.from("{}"),
    {},
    2000,
  );
  expect(result.status).toBe(307);
  expect(redirectFollowed).toBe(false);
});

it("finishes on response headers even when the response body stays open", async () => {
  const result = await send(
    origin + "/hooks/success",
    Buffer.from("{}"),
    {},
    2000,
  );
  expect(result.status).toBe(200);
});

it("ends the request when the receiver never acknowledges it", async () => {
  await expect(
    send(origin + "/hooks/timeout", Buffer.from("{}"), {}, 100),
  ).rejects.toMatchObject({ name: "AbortError" });
});
