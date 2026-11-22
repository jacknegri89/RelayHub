import { afterEach, expect, it, vi } from "vitest";
import sitemap from "../src/app/sitemap";
import robots from "../src/app/robots";
import { publicPageMetadata } from "../src/server/public-metadata";

afterEach(() => vi.unstubAllEnvs());

it("publishes only the public pages on the configured production origin", () => {
  const origin = "https://portfolio.example";
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("RELAYHUB_BASE_URL", origin);
  expect(sitemap().map(({ url }) => new URL(url).pathname)).toEqual([
    "/",
    "/guide",
    "/lost-response",
    "/privacy",
    "/cookies",
    "/terms",
  ]);
  expect(robots().sitemap).toBe(origin + "/sitemap.xml");
  const metadata = publicPageMetadata(
    "/guide",
    "Delivery guide",
    "How delivery works",
  );
  expect(metadata.alternates?.canonical).toBe(origin + "/guide");
  expect(metadata.robots).toEqual({ index: true, follow: true });
});

it("keeps preview builds out of search even when they know the production URL", () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("RELAYHUB_BASE_URL", "https://portfolio.example");
  expect(sitemap()).toEqual([]);
  expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
  expect(
    publicPageMetadata("/", "RelayHub", "Webhook delivery").robots,
  ).toEqual({
    index: false,
    follow: false,
  });
});
