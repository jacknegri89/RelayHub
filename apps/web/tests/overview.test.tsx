import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DeliveryActivity } from "../src/components/delivery-activity";
import { OverviewTrend } from "../src/components/overview-trend";

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
  timings: { samples: 2, percentiles: [0, 9.5, 9.9] },
};
const workspace = "/workspace/example";

it("compares rolling success rates in percentage points, including measured zero times", () => {
  const html = renderToStaticMarkup(
    <DeliveryActivity report={report} workspace={workspace} locale="en" />,
  );
  expect(html).toContain("75%");
  expect(html).toContain("+25 pp");
  expect(html).toContain("0 ms");
  expect(html).toContain("9.9 ms");
  expect(html).toContain('href="/workspace/example/sources"');
  expect(html).toContain('href="/workspace/example/destinations"');
  expect(html).toContain('href="/workspace/example/deliveries?status=failed"');
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
