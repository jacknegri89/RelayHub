import type { MetadataRoute } from "next";
import {
  publicIndexingEnabled,
  publicOrigin,
  publicPaths,
} from "../server/public-metadata";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!publicIndexingEnabled()) {
    return [];
  }
  const origin = publicOrigin();
  return publicPaths.map((path) => ({ url: new URL(path, origin).href }));
}
