import type { MetadataRoute } from "next";
import { publicIndexingEnabled, publicOrigin } from "../server/public-metadata";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (!publicIndexingEnabled()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: new URL("/sitemap.xml", publicOrigin()).href,
  };
}
