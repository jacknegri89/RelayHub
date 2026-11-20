export type Locale = "en" | "it";
export const languageCookie = "relayhub_lang";

export function translator(locale: Locale) {
  return (english: string, italian: string) => {
    if (locale === "it") {
      return italian;
    }
    return english;
  };
}
