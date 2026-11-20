import type { Metadata, Viewport } from "next";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "./styles.css";
import { getLocale } from "../server/locale";
import { LocaleProvider } from "../components/locale";

// Hides the homepage entrance actors until GSAP takes over; the timeout is a
// safety net so content always appears even if scripts fail.
const INTRO_GUARD =
  "document.documentElement.classList.add('intro-pending');" +
  "setTimeout(function(){document.documentElement.classList.remove('intro-pending')},2500);";

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
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INTRO_GUARD }} />
      </head>
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
