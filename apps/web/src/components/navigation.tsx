"use client";
import { useLocale } from "./locale";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@relayhub/shared/access";
import { OrganizationGuide } from "./organization-guide";
import { AlertLink } from "./alert-link";
import type { AlertSummary } from "../server/destination-monitoring";

const sections = [
  ["Overview", "Panoramica", ""],
  ["Sources", "Sorgenti", "/sources"],
  ["Destinations", "Destinazioni", "/destinations"],
  ["Events", "Eventi", "/events"],
  ["Deliveries", "Consegne", "/deliveries"],
  ["Alerts", "Avvisi", "/alerts"],
  ["Settings", "Impostazioni", "/settings"],
];

export function Navigation({
  organizationId,
  role,
  alerts,
}: {
  organizationId: string;
  role: Role;
  alerts: AlertSummary;
}) {
  const { t } = useLocale();
  const pathname = usePathname();
  const base = "/workspace/" + organizationId;
  return (
    <>
      <nav
        className="navigation"
        aria-label={t("Organization", "Organizzazione")}
      >
        {sections.map(([label, italianLabel, segment]) => {
          const path = base + segment;
          const active =
            pathname === path ||
            Boolean(segment && pathname.startsWith(path + "/"));
          if (segment === "/alerts") {
            return (
              <AlertLink
                key={path}
                organizationId={organizationId}
                summary={alerts}
                active={active}
              />
            );
          }
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
      <OrganizationGuide
        key={pathname}
        path={pathname.slice(base.length)}
        role={role}
      />
    </>
  );
}
