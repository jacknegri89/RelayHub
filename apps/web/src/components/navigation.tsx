"use client";
import { useLocale } from "./locale";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@relayhub/shared/access";
import { OrganizationGuide } from "./organization-guide";
import { AlertLink } from "./alert-link";
import type { AlertSummary } from "../server/destination-monitoring";
import { InterfaceIcon } from "./interface-icon";

const navigationGroups = [
  {
    labels: ["Monitoring", "Monitoraggio"],
    sections: [
      ["Overview", "Panoramica", "", "overview"],
      ["Events", "Eventi", "/events", "events"],
      ["Deliveries", "Consegne", "/deliveries", "deliveries"],
      ["Alerts", "Avvisi", "/alerts", "alerts"],
    ],
  },
  {
    labels: ["Configuration", "Configurazione"],
    sections: [
      ["Sources", "Sorgenti", "/sources", "sources"],
      ["Destinations", "Destinazioni", "/destinations", "destinations"],
      ["Settings", "Impostazioni", "/settings", "settings"],
    ],
  },
] as const;

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
  const [openPath, setOpenPath] = useState<string | null>(null);
  const expanded = openPath === pathname;
  const base = "/workspace/" + organizationId;
  return (
    <div className="workspace-menu" data-expanded={expanded}>
      <button
        type="button"
        className="menu-toggle"
        aria-expanded={expanded}
        aria-controls="workspace-sections"
        onClick={() => {
          if (expanded) {
            setOpenPath(null);
          } else {
            setOpenPath(pathname);
          }
        }}
      >
        <InterfaceIcon name="menu" /> {t("Menu and guide", "Menu e guida")}
      </button>
      <div className="menu-body" id="workspace-sections">
        <nav
          className="navigation"
          aria-label={t("Organization", "Organizzazione")}
        >
          {navigationGroups.map((group) => (
            <div className="nav-group" key={group.labels[0]}>
              <p>{t(group.labels[0], group.labels[1])}</p>
              {group.sections.map(([label, italianLabel, segment, icon]) => {
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
                    key={segment}
                    href={path}
                    aria-current={(active && "page") || undefined}
                  >
                    <InterfaceIcon name={icon} /> {t(label, italianLabel)}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <OrganizationGuide
          key={pathname}
          path={pathname.slice(base.length)}
          role={role}
        />
      </div>
    </div>
  );
}
