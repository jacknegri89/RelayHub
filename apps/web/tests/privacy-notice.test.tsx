import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import PrivacyPage from "../src/app/privacy/page";
import { translator } from "../src/locale";

const config = vi.hoisted(() => ({
  RELAYHUB_MAIL_PROVIDER: "gmail",
  RETENTION_DAYS: 12,
  RELAYHUB_ACCOUNT_LINK_MINUTES: 15,
}));
vi.mock("@relayhub/shared/config", () => ({ settings: () => config }));
vi.mock("../src/server/locale", () => ({
  getLocale: async () => ({ locale: "it", t: translator("it") }),
}));
vi.mock("../src/components/policy-page", () => ({
  PolicyPage: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
}));

it.each([
  ["gmail", "Google (Gmail)"],
  ["resend", "Resend"],
])(
  "describes the configured %s sender and live retention in the Italian notice",
  async (provider, name) => {
    config.RELAYHUB_MAIL_PROVIDER = provider;
    const html = renderToStaticMarkup(await PrivacyPage());
    expect(html).toContain(name + " riceve");
    expect(html).toContain("più vecchi di 12 giorni");
    expect(html).toContain("dopo 15 minuti");
    expect(html.includes("Google API Services User Data Policy")).toBe(
      provider === "gmail",
    );
    expect(html).toContain("mailto:negrigiacomo435@gmail.com");
  },
);
