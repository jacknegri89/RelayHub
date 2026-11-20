import { getLocale } from "../../server/locale";
import { stateLabel } from "../../components/display";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import { ActionForm } from "../../components/forms";
import { PageHeading } from "../../components/page-heading";
import { SectionGuide } from "../../components/section-guide";
import { auth } from "../../server/auth";

export default async function Workspace() {
  const { t } = await getLocale();
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }
  const memberships = await database().organizationMember.findMany({
    where: { userId: session.user.id },
    include: { organization: true },
    orderBy: { organization: { name: "asc" } },
  });
  return (
    <main id="main" className="guided-page">
      <SectionGuide title={t("Choose where to work", "Scegli dove lavorare")}>
        {t(
          "Each organization has its own events, destinations and team. Open one you belong to or create one here. To join a teammate’s organization, share your account ID privately with its owner.",
          "Ogni organizzazione ha i propri eventi, destinatari e membri. Aprine una di cui fai parte o creane una qui. Per unirti a quella del tuo team, comunica in privato il tuo ID account al proprietario.",
        )}
      </SectionGuide>
      <div>
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
      </div>
    </main>
  );
}
