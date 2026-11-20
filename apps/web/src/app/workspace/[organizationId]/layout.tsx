import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { settings } from "@relayhub/shared/config";
import { requireOrganization } from "../../../server/authorization";
import { HttpError } from "../../../server/http";
import { Navigation } from "../../../components/navigation";

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ organizationId: string }>;
}) {
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
          Organizations ↗
        </Link>
        <p className="org-name">{access.membership.organization.name}</p>
        <Navigation base={"/workspace/" + organizationId} />
      </aside>
      <main id="main" className="content">
        {settings().isDemo && (
          <p className="demo-label">Local demo environment</p>
        )}
        {children}
      </main>
    </div>
  );
}
