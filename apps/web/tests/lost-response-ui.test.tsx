import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { LocaleProvider } from "../src/components/locale";
import {
  LostResponseTest,
  RunEvidence,
} from "../src/components/lost-response-test";
import {
  hasDashboardEvent,
  type LostResponseReport,
} from "../src/lost-response-report";

const deliveryId = "79c2b693-a673-4e9a-be5a-65f1fcb48f25";
const start = "2026-11-21T14:11:52.031Z";
const finish = "2026-11-21T14:11:57.050Z";
const report: LostResponseReport = {
  runId: "f2df3e42-086e-4d29-a7f6-b4884bd93e50",
  event: {
    id: "13ddb949-609b-4dd0-8128-6db15032d75d",
    type: "order.created",
    receivedAt: start,
    sourceName: "Test orders",
  },
  destinationName: "Order receiver",
  deliveryId,
  status: "retry_scheduled",
  requestsReceived: 1,
  ordersSaved: 1,
  orderSavedAt: "2026-11-21T14:11:52.200Z",
  attempts: [
    {
      number: 1,
      deliveryId,
      startedAt: start,
      finishedAt: finish,
      outcome: "retry",
      httpStatus: null,
      durationMs: 5019,
    },
  ],
};

it("starts with no claimed measurements before the visitor sends an order", () => {
  const html = renderToStaticMarkup(
    <LostResponseTest formProof="sample" minFormTimeMs={600} />,
  );
  expect(html).toContain("Start the test");
  expect(html).not.toContain("<output");
  expect(html).not.toContain("<details");
});

it("requires event metadata and a valid receipt time before rendering a dashboard report", () => {
  expect(hasDashboardEvent(report)).toBe(true);
  const previousFormat = { runId: report.runId, attempts: report.attempts };
  expect(hasDashboardEvent(previousFormat)).toBe(false);
  expect(
    hasDashboardEvent({
      ...report,
      event: { ...report.event, receivedAt: "unknown" },
    }),
  ).toBe(false);
});

it("shows the receiver's first commit even before another attempt has run", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider locale="it">
      <RunEvidence report={report} />
    </LocaleProvider>,
  );
  expect(html).toContain('aria-label="Ordini salvati">1</output>');
  expect(html).toContain('aria-label="Richieste ricevute">1</output>');
  expect(html).toContain(report.orderSavedAt);
  expect(html).toContain("Nessuna risposta HTTP registrata");
  expect(html).not.toContain("Timeout");
  expect(html).not.toContain("Tentativo 2");
});

it("renders both full delivery IDs, measured HTTP status and independent receiver counters", () => {
  const retry = {
    ...report.attempts[0],
    number: 2,
    startedAt: "2026-11-21T14:12:00.045Z",
    finishedAt: "2026-11-21T14:12:00.065Z",
    outcome: "success",
    httpStatus: 204,
    durationMs: 20,
  };
  const delivered = {
    ...report,
    requestsReceived: 2,
    status: "delivered",
    attempts: [retry, ...report.attempts],
  };
  const html = renderToStaticMarkup(<RunEvidence report={delivered} />);
  expect(html.split("<code>" + deliveryId + "</code>")).toHaveLength(3);
  expect(html.match(/<details/g)).toHaveLength(2);
  expect(html).toContain("HTTP 204");
  expect(html).toContain('aria-label="Requests received">2</output>');
  expect(html).toContain('aria-label="Orders saved">1</output>');
  expect(html.indexOf("Attempt 1")).toBeLessThan(html.indexOf("Attempt 2"));
});
