import type { Metadata, Viewport } from "next";
import "@fontsource-variable/onest/wght.css";
import "@fontsource-variable/bricolage-grotesque/wght.css";
import "./styles.css";
import { getLocale } from "../server/locale";
import { LocaleProvider } from "../components/locale";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getLocale();
  return {
    title: { default: "RelayHub", template: "%s · RelayHub" },
    description: t(
      "Receive and route signed webhook events.",
      "Ricevi e instrada eventi webhook firmati.",
    ),
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#0b101c",
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
