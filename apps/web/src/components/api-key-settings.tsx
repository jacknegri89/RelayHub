import { database } from "@relayhub/db";
import { ACTIVE_API_KEY_LIMIT } from "../server/organization-api-keys";
import { getLocale } from "../server/locale";
import { ActionForm } from "./forms";
import { Time } from "./display";
import styles from "./workspace-records.module.css";

export async function ApiKeySettings({
  organizationId,
}: {
  organizationId: string;
}) {
  const { t } = await getLocale();
  const keys = await database().organizationApiKey.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, name: true, createdAt: true },
  });
  const endpoint = "/api/organizations/" + organizationId + "/api-keys";
  return (
    <section className="panel">
      <h2>{t("Read-only API keys", "Chiavi API di sola lettura")}</h2>
      <p>
        {t(
          "Give an integration access to this organization’s event and delivery metadata. Send its key in the Authorization header when calling /api/v1/events or /api/v1/deliveries.",
          "Consenti a un’integrazione di consultare i metadati di eventi e consegne dell’organizzazione. Invia la chiave nell’header Authorization per chiamare /api/v1/events o /api/v1/deliveries.",
        )}
      </p>
      {keys.length >= ACTIVE_API_KEY_LIMIT && (
        <p>
          {t(
            "Revoke an unused key before creating another.",
            "Revoca una chiave inutilizzata prima di crearne un’altra.",
          )}
        </p>
      )}
      {!keys.length && (
        <p className="muted">
          {t("No active API keys.", "Nessuna chiave API attiva.")}
        </p>
      )}
      {!!keys.length && (
        <ul className="routes">
          {keys.map((key) => (
            <li key={key.id}>
              <span className="break">
                {key.name} · <Time value={key.createdAt} />
              </span>
              <ActionForm
                endpoint={endpoint}
                fields={{ action: "revoke", id: key.id }}
                label={t("Revoke key", "Revoca chiave")}
                confirm={t(
                  "Revoke this key? Integrations using it will lose access.",
                  "Revocare questa chiave? Le integrazioni che la usano perderanno l’accesso.",
                )}
              />
            </li>
          ))}
        </ul>
      )}
      <details className={styles.task}>
        <summary>{t("Issue a new key", "Genera una nuova chiave")}</summary>
        <ActionForm
          disabled={keys.length >= ACTIVE_API_KEY_LIMIT}
          endpoint={endpoint}
          fields={{ action: "create" }}
          label={t("Create API key", "Crea chiave API")}
          secretLabel={t("API key", "Chiave API")}
        >
          <label>
            {t("Key name", "Nome della chiave")}
            <input
              name="name"
              maxLength={80}
              required
              placeholder={t(
                "e.g. Accounting dashboard",
                "Es. Cruscotto contabilità",
              )}
            />
          </label>
        </ActionForm>
      </details>
    </section>
  );
}
