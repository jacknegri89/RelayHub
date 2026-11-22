import type { Metadata } from "next";

export const publicPaths = [
  "/",
  "/guide",
  "/lost-response",
  "/privacy",
  "/cookies",
  "/terms",
] as const;

type PublicPath = (typeof publicPaths)[number];

export function publicOrigin() {
  return new URL(process.env.RELAYHUB_BASE_URL || "http://localhost:3000");
}

export function publicIndexingEnabled() {
  // Preview aliases and local copies must never compete with the live portfolio.
  return (
    process.env.VERCEL_ENV === "production" &&
    publicOrigin().protocol === "https:"
  );
}

export function publicPageMetadata(
  path: PublicPath,
  title: string,
  description: string,
): Metadata {
  const canonical = new URL(path, publicOrigin()).href;
  const index = publicIndexingEnabled();
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index, follow: index },
    openGraph: {
      type: "website",
      siteName: "RelayHub",
      url: canonical,
      title,
      description,
      images: [
        {
          url: new URL("/relayhub-share.jpg", canonical).href,
          width: 1200,
          height: 630,
          type: "image/jpeg",
          alt: "RelayHub · One webhook. Many destinations.",
        },
      ],
    },
  };
}
