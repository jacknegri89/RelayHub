import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DestinationHistory,
  type DestinationDay,
} from "../src/components/destination-history";

function week(start: string): DestinationDay[] {
  const date = new Date(start + "T00:00:00Z");
  return Array.from({ length: 7 }, () => {
    const day = {
      date: date.toISOString().slice(0, 10),
      successes: 0,
      failures: 0,
      averageMs: null,
    };
    date.setUTCDate(date.getUTCDate() + 1);
    return day;
  });
}

describe("destination attempt history", () => {
  it("opens the selected failed UTC day and omits the link on a day without failures", () => {
    const days = week("2026-06-29");
    days[1].failures = 2;
    days[2].successes = 1;
    const attemptsPath = "/workspace/org/destinations/dest/attempts";
    const selected = renderToStaticMarkup(
      <DestinationHistory
        days={days}
        locale="it"
        initialDay={days[1].date}
        attemptsPath={attemptsPath}
      />,
    );
    expect(selected).toContain('href="' + attemptsPath + '?day=2026-06-30"');
    expect(selected).toContain("Vedi tentativi falliti");
    const successful = renderToStaticMarkup(
      <DestinationHistory
        days={days}
        locale="en"
        initialDay={days[2].date}
        attemptsPath={attemptsPath}
      />,
    );
    expect(successful).not.toContain("View failed attempts");
  });
  it("explains an idle UTC week without drawing zero latency", () => {
    const html = renderToStaticMarkup(
      <DestinationHistory days={week("2026-01-01")} locale="en" />,
    );
    expect(html).toContain(
      "No outbound attempts recorded in these seven days.",
    );
    expect(html).not.toContain("<svg");
    expect(html).not.toContain('role="status"');
  });

  it("keeps completion counts when no HTTP responses have a duration", () => {
    const days = week("2026-06-29");
    days[4].failures = 7;
    const html = renderToStaticMarkup(
      <DestinationHistory days={days} locale="it" />,
    );
    expect(html).toContain("Nessuna risposta HTTP con durata misurata");
    expect(html).toContain("3 luglio 2026");
    expect(html).toContain("Nessuna misura");
    expect(html).not.toContain("<svg");
    expect(html.match(/type="radio"/g)).toHaveLength(7);
  });

  it("breaks the latency line at a missing day and plots a true zero", () => {
    const days = week("2025-12-29");
    days[1].successes = 2;
    days[1].averageMs = 25;
    days[2].failures = 1;
    days[2].averageMs = 50;
    days[4].successes = 3;
    days[4].averageMs = 0;
    const html = renderToStaticMarkup(
      <DestinationHistory days={days} locale="en" />,
    );
    const path = html.match(/<path d="([^"]+)"/)?.[1];
    expect(path?.match(/M/g)).toHaveLength(2);
    expect(path?.match(/L/g)).toHaveLength(1);
    expect(path).toMatch(/ 100$/);
    expect(html).toContain("0 ms");
    expect(html).toContain("January 2, 2026");
    expect(html).toContain("December 29, 2025");
  });

  it("keeps a single failed attempt visible beside a large successful volume", () => {
    const days = week("2026-06-29");
    days[6] = {
      ...days[6],
      successes: 100_000,
      failures: 1,
      averageMs: 12_345,
    };
    const html = renderToStaticMarkup(
      <DestinationHistory days={days} locale="en" />,
    );
    expect(html).toContain("100,000");
    expect(html).toContain("<dd>1</dd>");
    expect(html).toContain("12,345 ms");
    expect(html).toContain("100K");
    expect(html).toContain("20K");
    expect(html).not.toContain("NaN");
  });
});
