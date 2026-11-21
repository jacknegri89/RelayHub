import { getLocale } from "../../server/locale";
import { stateLabel } from "../../components/display";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import { ActionForm } from "../../components/forms";
import { PersonalWorkspace } from "../../components/personal-workspace";
import { initials } from "../../profile-avatars";
import styles from "../../components/personal-workspace.module.css";
import { InterfaceIcon } from "../../components/interface-icon";
import { auth } from "../../server/auth";

export async function generateMetadata() {
  const { t } = await getLocale();
  return { title: t("Organizations", "Organizzazioni") };
}

export default async function Workspace() {
  const { t } = await getLocale();
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }
  const memberships = await database().organizationMember.findMany({
    where: { userId: session.user.id },
    select: {
      role: true,
      organization: {
        select: {
          id: true,
          name: true,
          _count: { select: { sources: true, destinations: true } },
        },
      },
    },
    orderBy: { organization: { name: "asc" } },
  });
  return (
    <PersonalWorkspace
      current="organizations"
      title={t("Organizations", "Organizzazioni")}
      guideTitle={t("Choose a workspace", "Scegli un’area di lavoro")}
      guide={t(
        "Each organization has its own sources, destinations and members. Open one to follow its deliveries. Your profile and sign-in settings apply to all your organizations.",
        "Ogni organizzazione ha le proprie sorgenti, destinazioni e persone. Aprine una per seguire le consegne. Il profilo e le impostazioni di accesso valgono per tutte le tue organizzazioni.",
      )}
    >
      {settings().isDemo && (
        <p className="demo-label">
          {t("Local demo environment", "Ambiente di prova locale")}
        </p>
      )}
      {memberships.length > 0 && (
        <section className={styles.panel} aria-labelledby="workspaces-heading">
          <header className={styles.listHeader}>
            <h2 id="workspaces-heading">
              {t("Your workspaces", "Le tue aree di lavoro")}
            </h2>
            <span>{memberships.length}</span>
          </header>
          <ul className={styles.organizations}>
            {memberships.map(({ organization, role }) => {
              const counts = organization._count;
              let sourcesLabel = t("sources", "sorgenti");
              let destinationsLabel = t("destinations", "destinazioni");
              if (counts.sources === 1) {
                sourcesLabel = t("source", "sorgente");
              }
              if (counts.destinations === 1) {
                destinationsLabel = t("destination", "destinazione");
              }
              return (
                <li key={organization.id}>
                  <Link href={"/workspace/" + organization.id}>
                    <span aria-hidden="true" className={styles.orgMark}>
                      {initials(organization.name)}
                    </span>
                    <span className={styles.orgName}>
                      <strong>{organization.name}</strong>
                      <span>{stateLabel(role, t)}</span>
                    </span>
                    <span className={styles.orgCounts}>
                      {counts.sources} {sourcesLabel} · {counts.destinations}{" "}
                      {destinationsLabel}
                    </span>
                    <InterfaceIcon name="arrow" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <details className={styles.task} open={memberships.length === 0}>
        <summary>{t("New organization", "Nuova organizzazione")}</summary>
        {!memberships.length && (
          <p className={styles.taskHint}>
            {t(
              "Give your first workspace a name. You can then connect the app that sends your webhooks.",
              "Dai un nome alla tua prima area di lavoro. Da lì potrai collegare l’app che invia i webhook.",
            )}
          </p>
        )}
        <ActionForm
          endpoint="/api/organizations"
          label={t("Create organization", "Crea organizzazione")}
          onId="/workspace/"
        >
          <label>
            {t("Organization name", "Nome dell’organizzazione")}{" "}
            <input
              name="name"
              maxLength={80}
              required
              placeholder={t("e.g. Online store", "Es. Negozio online")}
            />
          </label>
        </ActionForm>
      </details>
      <details className={styles.task}>
        <summary>{t("Join a team", "Unisciti a un team")}</summary>
        <div>
          <p>
            {t(
              "Share your account ID privately with the organization owner so they can add you.",
              "Per farti aggiungere, comunica in privato questo ID al proprietario dell’organizzazione.",
            )}
          </p>
          <code className="break">{session.user.id}</code>
        </div>
      </details>
    </PersonalWorkspace>
  );
}
