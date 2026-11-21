import { getLocale } from "../../../server/locale";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { settings } from "@relayhub/shared/config";
import { requireOrganization } from "../../../server/authorization";
import { HttpError } from "../../../server/http";
import { Navigation } from "../../../components/navigation";
import { InterfaceIcon } from "../../../components/interface-icon";
import { readAlertSummary } from "../../../server/destination-monitoring";

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ organizationId: string }>;
}) {
  const { t } = await getLocale();
  const { organizationId } = await params;
  let access;
  try {
    access = await requireOrganization(await headers(), organizationId, "read");
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 401) {
        redirect("/login");
      }
      notFound();
    }
    throw error;
  }
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link href="/workspace" className="org-switch">
          <span className="org-symbol">
            <InterfaceIcon name="workspace" />
          </span>
          <span>
            <small>{t("Organizations", "Organizzazioni")}</small>
            <strong>{access.membership.organization.name}</strong>
          </span>
          <InterfaceIcon name="switcher" />
        </Link>
        <Navigation
          organizationId={organizationId}
          alerts={await readAlertSummary(organizationId)}
          role={access.membership.role}
        />
      </aside>
      <main id="main" className="content">
        {settings().isDemo && (
          <p className="demo-label">
            {t("Local demo environment", "Ambiente di prova locale")}
          </p>
        )}
        {children}
      </main>
    </div>
  );
}
