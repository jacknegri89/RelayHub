import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DeliveryTrace, EventCone } from "../src/components/delivery-trace";
import { DeliveryActivity } from "../src/components/delivery-activity";
import { translator } from "../src/locale";

vi.mock("../src/server/locale", () => ({
  getLocale: async () => ({ locale: "en", t: translator("en") }),
}));

const delivery = {
  destination: { name: "Warehouse" },
  nextAt: null,
  status: "delivering" as const,
};
const openAttempt = {
  id: "attempt-1",
  number: 1,
  startedAt: new Date("2026-01-01T00:00:00Z"),
  finishedAt: null,
  retryAt: null,
  httpStatus: null,
  durationMs: null,
  outcome: "in_progress",
};

describe("delivery charts", () => {
  it("shows a pending delivery before its first attempt", async () => {
    const html = renderToStaticMarkup(
      await DeliveryTrace({
        delivery: { ...delivery, status: "pending", attempts: [] },
      }),
    );
    expect(html).toContain("No attempts yet");
    expect(html).not.toContain("data-segment");
  });

  it("never draws a receiver rejection for an unfinished attempt", async () => {
    const html = renderToStaticMarkup(
      await DeliveryTrace({
        delivery: { ...delivery, attempts: [openAttempt] },
      }),
    );
    expect(html).toContain("in progress");
    expect(html).not.toContain('class="mark-failed"');
    expect(html).toContain('class="mark-local"');
    expect(html).not.toContain("data-segment");
  });

  it("keeps a policy block on the relay lane", async () => {
    const attempt = {
      ...openAttempt,
      finishedAt: openAttempt.startedAt,
      outcome: "policy_blocked",
    };
    const html = renderToStaticMarkup(
      await DeliveryTrace({
        delivery: { ...delivery, status: "failed", attempts: [attempt] },
      }),
    );
    expect(html).toContain("policy blocked");
    expect(html).not.toContain("data-segment");
    expect(html).not.toContain("retry available");
  });

  it("distinguishes no webhook routes from a pending delivery", async () => {
    const html = renderToStaticMarkup(await EventCone({ deliveries: [] }));
    expect(html).toContain("No matching destination");
    expect(html).not.toContain("Replay");
  });

  it("keeps success rate and unmeasured latency empty on an idle overview", () => {
    const html = renderToStaticMarkup(
      DeliveryActivity({
        report: {
          counts: {
            delivered: 0,
            failed: 0,
            previousDelivered: 0,
            previousFailed: 0,
            meanSuccessfulMs: null,
          },
          received: 0,
          comparisonRetained: true,
          inflight: 0,
        },
        workspace: "/workspace/example",
        locale: "en",
      }),
    );
    expect(html).not.toContain("data-packet");
    expect(html).toContain("No completed deliveries");
    expect(html).toContain("—");
    expect(html).not.toContain("0 ms");
  });

  it("preserves the real attempt numbers in a long history", async () => {
    const attempts = Array.from({ length: 8 }, (_, index) => ({
      ...openAttempt,
      id: "attempt-" + (index + 1),
      number: index + 1,
      httpStatus: 503,
      outcome: "retry",
      finishedAt: openAttempt.startedAt,
    }));
    const html = renderToStaticMarkup(
      await DeliveryTrace({
        delivery: { ...delivery, status: "failed", attempts },
      }),
    );
    expect(html).toContain("8 attempts");
    expect(html).toContain("Showing the latest five");
    expect(html).not.toContain("attempt 3: HTTP");
    expect(html).toContain("attempt 4: HTTP 503");
    expect(html).toContain("attempt 8: HTTP 503");
  });

  it("keeps long destination names intact and discloses a partial diagram", async () => {
    const deliveries = Array.from({ length: 9 }, (_, index) => ({
      id: String(index + 1),
      destination: {
        name: "Northern warehouse receiving station " + (index + 1),
      },
      status: "retry_scheduled" as const,
      attemptCount: 2,
    }));
    const html = renderToStaticMarkup(await EventCone({ deliveries }));
    expect(html).toContain("9 destinations");
    expect(html).toContain("first six");
    expect(html).toContain("Northern warehouse receiving station 6");
    expect(html).not.toContain("Northern warehouse receiving station 7");
    expect(html).toContain("retry scheduled · 2 attempts");
  });
});
