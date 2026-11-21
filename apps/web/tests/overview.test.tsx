import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { Overview } from "../src/components/activity";
import {
  DeliveryActivity,
  ResponseTimes,
} from "../src/components/delivery-activity";
import { OverviewRouting } from "../src/components/overview-routing";
import { OverviewTrend } from "../src/components/overview-trend";
import { translator } from "../src/locale";
import { readOverview } from "../src/server/overview";

vi.mock("../src/server/overview", () => ({ readOverview: vi.fn() }));
vi.mock("../src/server/locale", () => ({
  getLocale: async () => ({ locale: "en", t: translator("en") }),
}));

const report = {
  counts: {
    delivered: 3,
    failed: 1,
    previousDelivered: 1,
    previousFailed: 1,
    meanSuccessfulMs: 0,
  },
  comparisonRetained: true,
  received: 4,
  inflight: 0,
  sources: 1,
  destinations: 2,
  hasConfiguredSources: true,
  hasConfiguredDestinations: true,
  activeRoutes: 1,
  timings: { samples: 2, percentiles: [0, 9.5, 9.9] },
};
const workspace = "/workspace/example";

it("prioritizes setup when idle and retained attempts when routing is disabled", async () => {
  const idle = {
    ...report,
    sources: 0,
    destinations: 0,
    hasConfiguredSources: false,
    hasConfiguredDestinations: false,
    activeRoutes: 0,
    received: 0,
    timings: { samples: 0, percentiles: null },
    counts: {
      delivered: 0,
      failed: 0,
      previousDelivered: 0,
      previousFailed: 0,
      meanSuccessfulMs: null,
    },
    days: [{ date: "2026-11-20", succeeded: 0, failed: 0 }],
    latest: [],
  };
  vi.mocked(readOverview).mockResolvedValueOnce(idle);
  const options = { organizationId: "example", editable: true };
  const quiet = renderToStaticMarkup(await Overview(options));
  expect(quiet).toContain("Set up webhook delivery");
  expect(quiet.indexOf("Set up webhook delivery")).toBeLessThan(
    quiet.indexOf("Delivery activity"),
  );
  expect(quiet).toContain("Configure a source");
  expect(quiet).toContain('href="/workspace/example/sources#create-source"');
  expect(quiet).toContain("Full delivery history");
  expect(quiet).toContain("Attempt trend");
  expect(quiet).toContain('href="/workspace/example/events"');
  expect(quiet).not.toContain("<polyline");
  expect(quiet).not.toContain('type="radio"');
  expect(quiet).not.toContain("Success rate");
  expect(quiet).not.toContain("HTTP response times");
  expect(quiet).not.toContain("Recent events");

  vi.mocked(readOverview).mockResolvedValueOnce({
    ...idle,
    days: [{ date: "2026-11-20", succeeded: 0, failed: 3 }],
  });
  const withHistory = renderToStaticMarkup(await Overview(options));
  expect(withHistory).toContain("Success rate");
  expect(withHistory.indexOf("Attempt trend")).toBeLessThan(
    withHistory.indexOf("Webhook routing"),
  );
  expect(withHistory).not.toContain("Seven-day attempt history");
});

it("offers a test only with an active route and configuration permission", () => {
  function setup(routes: number, editable: boolean) {
    return renderToStaticMarkup(
      <OverviewRouting
        report={{ ...report, activeRoutes: routes }}
        workspace={workspace}
        locale="it"
        editable={editable}
        awaitingEvent
      />,
    );
  }
  const testPath = workspace + "/destinations?task=test";
  const ready = setup(1, true);
  expect(ready).toContain("3 / 3 pronti");
  expect(ready).toContain(testPath);
  expect(ready).toContain("Vedi gli endpoint");
  const disconnected = setup(0, true);
  expect(disconnected).toContain("2 / 3 pronti");
  expect(disconnected).not.toContain(testPath);
  const readOnly = setup(1, false);
  expect(readOnly).toContain("3 / 3 pronti");
  expect(readOnly).not.toContain(testPath);
});

it("compares rolling success rates in percentage points, including measured zero times", () => {
  const html = renderToStaticMarkup(
    <>
      <OverviewRouting
        report={report}
        workspace={workspace}
        locale="en"
        editable={false}
      />
      <DeliveryActivity report={report} workspace={workspace} locale="en" />
      <ResponseTimes timings={report.timings} locale="en" />
    </>,
  );
  expect(html).toContain("75%");
  expect(html).toContain("+25 pp");
  expect(html).toContain("0 ms");
  expect(html).toContain("9.9 ms");
  expect(html).toContain('href="/workspace/example/sources"');
  expect(html).toContain('href="/workspace/example/destinations"');
  expect(html).toContain('href="/workspace/example/deliveries?status=failed"');
  expect(html).toContain("Full failure history");
  expect(html).not.toContain("?status=delivered");
});

it("shows the missing routing step only to members allowed to configure it", () => {
  const disconnected = { ...report, activeRoutes: 0 };
  const manager = renderToStaticMarkup(
    <OverviewRouting
      report={disconnected}
      workspace={workspace}
      locale="en"
      editable
    />,
  );
  const viewer = renderToStaticMarkup(
    <OverviewRouting
      report={disconnected}
      workspace={workspace}
      locale="en"
      editable={false}
    />,
  );
  expect(manager).toContain("Set up routing");
  expect(viewer).toContain("An administrator can link");
  expect(viewer).not.toContain("Set up routing");
});

it("opens the configured inventory when every source or warehouse is disabled", () => {
  const warehouse = { ...report, destinations: 0, activeRoutes: 0 };
  const render = (network: typeof warehouse) =>
    renderToStaticMarkup(
      <OverviewRouting
        report={network}
        workspace={workspace}
        locale="en"
        editable
      />,
    );
  const disabled = render(warehouse);
  expect(disabled).toContain("Manage destinations");
  expect(disabled).not.toContain("#create-destination");
  const firstWarehouse = render({
    ...warehouse,
    hasConfiguredDestinations: false,
  });
  expect(firstWarehouse).toContain(
    'href="/workspace/example/destinations#create-destination"',
  );
  const disabledSenders = render({ ...warehouse, sources: 0 });
  expect(disabledSenders).toContain("Manage sources");
  expect(disabledSenders).not.toContain("#create-source");
});

it("suppresses a misleading rate change when retention may have removed previous deliveries", () => {
  const html = renderToStaticMarkup(
    <DeliveryActivity
      report={{ ...report, comparisonRetained: false }}
      workspace={workspace}
      locale="it"
    />,
  );
  expect(html).toContain("75%");
  expect(html).toContain("Il confronto richiede 48 ore di storico");
  expect(html).not.toContain("+25 pp");
});

it("starts on the latest UTC day with exact localized counts alongside each series", () => {
  const days = Array.from({ length: 7 }, (_, index) => ({
    date: "2026-11-2" + index,
    succeeded: index * 1000,
    failed: index,
  }));
  const html = renderToStaticMarkup(<OverviewTrend days={days} locale="it" />);
  expect(html.match(/type="radio"/g)).toHaveLength(7);
  expect(html.match(/<polyline/g)).toHaveLength(3);
  expect(html).toContain("26 novembre 2026");
  expect(html).toContain(new Intl.NumberFormat("it").format(6006));
  expect(html).toContain("Oggi parziale");
});
