export type Locale = "en" | "it";
export const languageCookie = "relayhub_lang";

export function formatUtcDateRange(locale: Locale, first: Date, last: Date) {
  const format = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  // Treat ICU's thin and regular spaces alike so server and browser hydrate the same text.
  return format.formatRange(first, last).replace(/\s+/gu, " ");
}

export function translator(locale: Locale) {
  return (english: string, italian: string) => {
    if (locale === "it") {
      return italian;
    }
    return english;
  };
}
