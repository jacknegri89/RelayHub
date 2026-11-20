import { getLocale } from "../../server/locale";
import { stateLabel } from "../../components/display";
import Link from "next/link";
import { headers } from "next/headers";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import { ActionForm } from "../../components/forms";
import { PageHeading } from "../../components/page-heading";
import { requireSession } from "../../server/authorization";

export default async function Workspace() {
  const { t } = await getLocale();
  const session = await requireSession(await headers());
  const memberships = await database().organizationMember.findMany({
    where: { userId: session.user.id },
    include: { organization: true },
    orderBy: { organization: { name: "asc" } },
  });
  return (
    <main id="main" className="workspace-alone">
      {settings().isDemo && (
        <p className="demo-label">
          {t("Local demo environment", "Ambiente di prova locale")}
        </p>
      )}
      <PageHeading title={t("Organizations", "Organizzazioni")} />
      <p className="muted">
        {t("Your account ID", "Il tuo ID account")}{" "}
        <code className="break">{session.user.id}</code>
      </p>
      {!memberships.length && (
        <p className="empty">
          {t(
            "Create an organization to collect events and configure delivery routes.",
            "Crea un’organizzazione per ricevere eventi e configurare le regole di inoltro.",
          )}
        </p>
      )}
      <ul className="organizations">
        {memberships.map(({ organization, role }) => (
          <li key={organization.id}>
            <Link href={"/workspace/" + organization.id}>
              {organization.name}
              <span>{stateLabel(role, t)} →</span>
            </Link>
          </li>
        ))}
      </ul>
      <section className="panel">
        <h2>{t("Create organization", "Crea organizzazione")}</h2>
        <ActionForm
          endpoint="/api/organizations"
          label={t("Create organization", "Crea organizzazione")}
          onId="/workspace/"
        >
          <label>
            {t("Organization name", "Nome dell’organizzazione")}{" "}
            <input name="name" maxLength={80} required />
          </label>
        </ActionForm>
      </section>
    </main>
  );
}
