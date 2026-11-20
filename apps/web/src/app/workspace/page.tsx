import Link from "next/link";
import { headers } from "next/headers";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import { ActionForm } from "../../components/forms";
import { PageHeading } from "../../components/page-heading";
import { requireSession } from "../../server/authorization";

export default async function Workspace() {
  const session = await requireSession(await headers());
  const memberships = await database().organizationMember.findMany({
    where: { userId: session.user.id },
    include: { organization: true },
    orderBy: { organization: { name: "asc" } },
  });
  return (
    <main id="main" className="workspace-alone">
      {settings().isDemo && (
        <p className="demo-label">Local demo environment</p>
      )}
      <PageHeading title="Organizations" />
      <p className="muted">
        Your account ID <code className="break">{session.user.id}</code>
      </p>
      {!memberships.length && (
        <p className="empty">
          Create an organization to collect events and configure delivery
          routes.
        </p>
      )}
      <ul className="organizations">
        {memberships.map(({ organization, role }) => (
          <li key={organization.id}>
            <Link href={"/workspace/" + organization.id}>
              {organization.name}
              <span>{role} →</span>
            </Link>
          </li>
        ))}
      </ul>
      <section className="panel">
        <h2>Create organization</h2>
        <ActionForm
          endpoint="/api/organizations"
          label="Create organization"
          onId="/workspace/"
        >
          <label>
            Organization name <input name="name" maxLength={80} required />
          </label>
        </ActionForm>
      </section>
    </main>
  );
}
