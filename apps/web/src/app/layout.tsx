import type { Metadata, Viewport } from "next";
import "@fontsource-variable/ibm-plex-sans/wght.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "./styles.css";
import { getLocale } from "../server/locale";
import { LocaleProvider } from "../components/locale";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getLocale();
  return {
    title: { default: "RelayHub", template: "%s · RelayHub" },
    description: t(
      "Receive signed webhooks, route them to your endpoints and follow every delivery attempt.",
      "Ricevi webhook firmati, instradali ai tuoi endpoint e segui ogni tentativo di consegna.",
    ),
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#0b0d10",
  colorScheme: "dark",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { locale, t } = await getLocale();
  return (
    <html lang={locale}>
      <body>
        <LocaleProvider locale={locale}>
          <a className="skip" href="#main">
            {t("Skip to content", "Vai al contenuto")}
          </a>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
