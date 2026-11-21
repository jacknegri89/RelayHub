import { describe, expect, it } from "vitest";
import { renderMail } from "@relayhub/shared/mail-layout";

const mail = {
  kind: "outage" as const,
  locale: "it" as const,
  section: "Avvisi di consegna",
  title: "Guasto della destinazione",
  description: "Tre tentativi di invio consecutivi sono falliti.",
  footer: "Puoi gestire gli avvisi nelle impostazioni della destinazione.",
};

describe("transactional email HTML", () => {
  it("uses the app's dark surfaces even when a mail client removes the style block", () => {
    const html = renderMail({ ...mail, preview: mail.title });
    const inlineOnly = html.replace(/<style>[\s\S]*?<\/style>/g, "");
    expect(inlineOnly).toContain('bgcolor="#0b0d10"');
    expect(inlineOnly).toContain('bgcolor="#171b21"');
    expect(inlineOnly).toContain('name="color-scheme" content="dark"');
  });

  it("escapes destination names in both the inbox preview and the visible details", () => {
    const name = 'Ordini & <img src=x onerror="alert(1)">';
    const html = renderMail({
      ...mail,
      preview: name,
      details: [{ label: "Destinazione", value: name }],
    });
    expect(html).not.toContain("<img");
    expect(html.match(/Ordini &amp; &lt;img/g)).toHaveLength(2);
    expect(html).toContain('lang="it"');
  });

  it("preserves the link fragment and escapes ampersands and quotes in the href", () => {
    const html = renderMail({
      ...mail,
      preview: "Recupero account",
      action: {
        label: "Apri",
        url: 'https://example.test/p?a=1&b=2#test"code',
      },
    });
    expect(html).toContain(
      'href="https://example.test/p?a=1&amp;b=2#test&quot;code"',
    );
  });

  it("rejects links outside the HTTP protocols", () => {
    expect(() =>
      renderMail({
        ...mail,
        preview: "Recupero account",
        action: { label: "Apri", url: "javascript:alert(1)" },
      }),
    ).toThrow("Invalid RelayHub email link");
  });
});
