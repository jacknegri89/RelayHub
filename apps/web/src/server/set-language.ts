"use server";

import { cookies } from "next/headers";
import { languageCookie, type Locale } from "../locale";

export async function setLanguage(locale: Locale) {
  if (locale !== "it" && locale !== "en") {
    throw new Error("Unsupported language");
  }
  const preferences = await cookies();
  preferences.set(languageCookie, locale, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.VERCEL_ENV === "production",
    maxAge: 365 * 24 * 60 * 60,
  });
}
