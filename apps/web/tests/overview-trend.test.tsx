import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { OverviewTrend } from "../src/components/overview-trend";

const dates = [
  "2026-12-29",
  "2026-12-30",
  "2026-12-31",
  "2027-01-01",
  "2027-01-02",
  "2027-01-03",
  "2027-01-04",
];
const emptyWeek = dates.map((date) => ({ date, succeeded: 0, failed: 0 }));

it.each([
  {
    locale: "it" as const,
    button: "Esplora un esempio",
    message: "Nessun tentativo di consegna",
  },
  {
    locale: "en" as const,
    button: "Explore an example",
    message: "No delivery attempts finished",
  },
])(
  "shows the real UTC window without plotting sample or zero values in $locale",
  ({ locale, button, message }) => {
    const markup = renderToStaticMarkup(
      <OverviewTrend days={emptyWeek} locale={locale} />,
    );
    const format = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    });
    const range = format.formatRange(
      new Date("2026-12-29T00:00:00Z"),
      new Date("2027-01-04T00:00:00Z"),
    );
    expect(markup).toContain(range.replace(/\s+/gu, " ") + " · UTC");
    expect(markup).toContain(message);
    expect(markup).toContain(button);
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('type="radio"');
    expect(markup).not.toContain("<polyline");
    expect(markup).not.toContain("aria-pressed");
  },
);

it("shows measured weekly volume when only an earlier day had traffic", () => {
  const days = [...emptyWeek];
  days[0] = { date: dates[0], succeeded: 16, failed: 0 };
  const markup = renderToStaticMarkup(
    <OverviewTrend days={days} locale="en" />,
  );
  expect(markup).toContain("Period total <strong>16</strong>");
  expect(markup).toContain('role="radiogroup"');
  expect(markup).toContain('data-series="failed"');
  expect(markup).not.toContain("Explore an example");
});
