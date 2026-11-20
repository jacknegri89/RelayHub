"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { translator, type Locale } from "../locale";
import { setLanguage } from "../server/set-language";

const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  const locale = useContext(LocaleContext);
  return { locale, t: translator(locale) };
}

export function T({ en, it }: { en: string; it: string }) {
  return useLocale().t(en, it);
}

export function LanguageSwitch() {
  const { locale, t } = useLocale();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const switching = useRef(false);

  function changeLanguage() {
    if (switching.current) {
      return;
    }
    switching.current = true;
    setFailed(false);
    startTransition(async () => {
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      let exit: Animation | undefined;
      try {
        if (!reduced) {
          exit = document.body.animate([{ opacity: 1 }, { opacity: 0.25 }], {
            duration: 165,
            easing: "ease-in",
            fill: "forwards",
          });
          await exit.finished;
        }
        let next: Locale = "it";
        if (locale === "it") {
          next = "en";
        }
        await setLanguage(next);
      } catch {
        setFailed(true);
      } finally {
        exit?.cancel();
        if (!reduced) {
          document.body.animate([{ opacity: 0.25 }, { opacity: 1 }], {
            duration: 350,
            easing: "ease-out",
          });
        }
        switching.current = false;
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="language-switch"
        data-locale={locale}
        aria-disabled={pending}
        aria-label={t("Passa all’italiano", "Switch to English")}
        onClick={changeLanguage}
      >
        <span lang="en">EN</span>
        <span lang="it">IT</span>
      </button>
      {failed && (
        <span role="alert">
          {t(
            "Language change failed. Try again.",
            "Cambio lingua non riuscito. Riprova.",
          )}
        </span>
      )}
    </>
  );
}
