"use client";
import { useLocale } from "./locale";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  ["Overview", "Panoramica", ""],
  ["Sources", "Sorgenti", "/sources"],
  ["Destinations", "Destinazioni", "/destinations"],
  ["Events", "Eventi", "/events"],
  ["Deliveries", "Consegne", "/deliveries"],
  ["Settings", "Impostazioni", "/settings"],
];

export function Navigation({ base }: { base: string }) {
  const { t } = useLocale();
  const pathname = usePathname();
  return (
    <nav
      className="navigation"
      aria-label={t("Organization", "Organizzazione")}
    >
      {sections.map(([label, italianLabel, segment]) => {
        const path = base + segment;
        const active =
          pathname === path ||
          Boolean(segment && pathname.startsWith(path + "/"));
        return (
          <Link
            key={t(label, italianLabel)}
            href={path}
            aria-current={(active && "page") || undefined}
          >
            {t(label, italianLabel)}
          </Link>
        );
      })}
    </nav>
  );
}
