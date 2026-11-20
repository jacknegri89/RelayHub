import type { Metadata, Viewport } from "next";
import "@fontsource-variable/public-sans/wght.css";
import "./styles.css";

export const metadata: Metadata = {
  title: { default: "RelayHub", template: "%s · RelayHub" },
  description: "Receive and route signed webhook events.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#090d12",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
