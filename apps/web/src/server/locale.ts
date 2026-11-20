import { cookies } from "next/headers";
import { languageCookie, translator, type Locale } from "../locale";

export async function getLocale() {
  const preferences = await cookies();
  let locale: Locale = "en";
  if (preferences.get(languageCookie)?.value === "it") {
    locale = "it";
  }
  return { locale, t: translator(locale) };
}
