import { getLocale } from "../server/locale";
import Link from "next/link";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import { ActionForm } from "./forms";
import { ApiKeySettings } from "./api-key-settings";
import { Status, ShortId, stateLabel } from "./display";
import { PageHeading } from "./page-heading";

const sourceProviderNames = { relayhub: "RelayHub", github: "GitHub" };

export async function Sources({
  organizationId,
  editable,
}: {
  organizationId: string;
  editable: boolean;
}) {
  const { t } = await getLocale();
  const items = await database().webhookSource.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      provider: true,
      enabled: true,
      _count: { select: { events: true } },
    },
  });
  const endpoint = "/api/organizations/" + organizationId;
  return (
    <>
      <PageHeading
        title={t("Sources", "Sorgenti")}
        description={t(
          "Manage public endpoints for signed webhooks.",
          "Gestisci gli endpoint pubblici che ricevono i webhook firmati.",
        )}
      />
      {editable && (
        <section className="panel">
          <h2>{t("Create source", "Crea sorgente")}</h2>
          <ActionForm
            endpoint={endpoint}
            label={t("Create source", "Crea sorgente")}
            fields={{ action: "source_create" }}
          >
            <label>
              {t("Source name", "Nome della sorgente")}{" "}
              <input
                name="name"
                required
                maxLength={80}
                placeholder={t("e.g. Online checkout", "Es. Cassa online")}
              />
            </label>
            <label>
              {t("Source type", "Tipo di sorgente")}
              <select name="provider" defaultValue="relayhub">
                <option value="relayhub">RelayHub</option>
                <option value="github">GitHub</option>
              </select>
            </label>
          </ActionForm>
        </section>
      )}
      {!items.length && (
        <p className="empty">
          {t("No sources yet.", "Nessuna sorgente configurata.")}
        </p>
      )}
      {items.map((item) => (
        <section key={item.id} className="panel">
          <div className="section-head">
            <h2>{item.name}</h2>
            <Status value={(item.enabled && "enabled") || "disabled"} />
          </div>
          <p>
            <code className="break">
              {settings().RELAYHUB_BASE_URL + "/api/webhooks/" + item.id}
            </code>
          </p>
          <p className="muted">
            {sourceProviderNames[item.provider]} · {item._count.events}{" "}
            {t("retained events", "eventi conservati")}
          </p>
          {editable && item.provider === "github" && (
            <details>
              <summary>
                {t(
                  "Connect a GitHub repository",
                  "Collega un repository GitHub",
                )}
              </summary>
              <ol>
                <li>
                  {t(
                    "In the repository, open Settings → Webhooks → Add webhook. Paste the source URL above into Payload URL.",
                    "Nel repository apri Settings → Webhooks → Add webhook. Incolla l’URL della sorgente nel campo Payload URL.",
                  )}
                </li>
                <li>
                  {t(
                    "Set Content type to application/json and paste the signing secret shown when you created this source into Secret. After rotating it, update Secret in GitHub.",
                    "Seleziona application/json in Content type e incolla in Secret la chiave di firma mostrata alla creazione della sorgente. Se la sostituisci, aggiorna anche Secret su GitHub.",
                  )}
                </li>
                <li>
                  {t(
                    "Select Just the push event and save. After your next push, look for github.push in Events. Use github.push as the event type when linking a destination.",
                    "Seleziona Just the push event e salva. Dopo il prossimo push, cerca github.push in Eventi. Usa github.push come tipo di evento nella regola di inoltro verso una destinazione.",
                  )}
                </li>
              </ol>
            </details>
          )}
          {editable && (
            <div className="edit-grid">
              <ActionForm
                endpoint={endpoint}
                label={t("Save source", "Salva sorgente")}
                fields={{ action: "source_update", id: item.id }}
              >
                <label>
                  {t("Source name", "Nome della sorgente")}{" "}
                  <input
                    name="name"
                    required
                    maxLength={80}
                    defaultValue={item.name}
                    placeholder={t("e.g. Online checkout", "Es. Cassa online")}
                  />
                </label>
                <label className="check">
                  <input
                    name="enabled"
                    type="checkbox"
                    defaultChecked={item.enabled}
                  />{" "}
                  {t("Enabled", "Attivo")}
                </label>
              </ActionForm>
              <ActionForm
                endpoint={endpoint}
                label={t(
                  "Rotate signing secret",
                  "Sostituisci la chiave di firma",
                )}
                fields={{ action: "source_rotate", id: item.id }}
                confirm={t(
                  "Rotate this source secret? Update the sender before it sends another webhook.",
                  "Vuoi sostituire la chiave di firma? Aggiorna il mittente prima del prossimo webhook.",
                )}
              />
            </div>
          )}
        </section>
      ))}
    </>
  );
}

export async function Destinations({
  organizationId,
  editable,
}: {
  organizationId: string;
  editable: boolean;
}) {
  const { t } = await getLocale();
  const db = database();
  const [items, sources] = await Promise.all([
    db.webhookDestination.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        enabled: true,
        url: true,
        subscriptions: {
          select: {
            sourceId: true,
            eventType: true,
            source: { select: { name: true } },
          },
        },
      },
    }),
    db.webhookSource.findMany({
      where: { organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const endpoint = "/api/organizations/" + organizationId;
  return (
    <>
      <PageHeading
        title={t("Destinations", "Destinazioni")}
        description={t(
          "Manage receivers and choose which events they get.",
          "Configura i destinatari e scegli gli eventi che ricevono.",
        )}
      />
      {editable && (
        <section className="panel">
          <h2>{t("Create destination", "Crea destinazione")}</h2>
          <ActionForm
            endpoint={endpoint}
            label={t("Create destination", "Crea destinazione")}
            fields={{ action: "destination_create" }}
          >
            <DestinationFields />
          </ActionForm>
          {settings().VERIFICATION_RECEIVER_SECRET && !settings().isDemo && (
            <p className="muted">
              {t(
                "Built-in verification receiver",
                "Destinatario integrato per le verifiche",
              )}{" "}
              <code className="break">
                {settings().RELAYHUB_BASE_URL + "/api/receiver/verify"}
              </code>
            </p>
          )}
          {settings().DEMO_RECEIVER_URL && (
            <p className="muted">
              {t("Demo receiver:", "Destinatario di prova:")}{" "}
              <code className="break">
                {settings().DEMO_RECEIVER_URL + "/hooks/success"}
              </code>
            </p>
          )}
        </section>
      )}
      {!items.length && (
        <p className="empty">
          {t("No destinations yet.", "Nessuna destinazione configurata.")}
        </p>
      )}
      {items.map((item) => (
        <section key={item.id} className="panel">
          <div className="section-head">
            <h2>{item.name}</h2>
            <Status value={(item.enabled && "enabled") || "disabled"} />
          </div>
          <p>
            <code className="break">{item.url}</code>
          </p>
          <p>
            <Link
              href={"/workspace/" + organizationId + "/destinations/" + item.id}
            >
              {t(
                "View seven-day history and alerts",
                "Vedi storico di 7 giorni e avvisi",
              )}
            </Link>
          </p>
          <h3>{t("Routes", "Regole di inoltro")}</h3>
          {!item.subscriptions.length && (
            <p className="muted">
              {t("No sources are linked.", "Nessuna sorgente collegata.")}
            </p>
          )}
          <ul className="routes">
            {item.subscriptions.map((route) => (
              <li key={route.sourceId + ":" + route.eventType}>
                <span>
                  {route.source.name}{" "}
                  <code>
                    {route.eventType ||
                      t("all event types", "tutti i tipi di evento")}
                  </code>
                </span>
                {editable && (
                  <ActionForm
                    endpoint={endpoint}
                    label={t("Remove route", "Rimuovi regola")}
                    confirm={t(
                      "Remove this route for future events?",
                      "Vuoi rimuovere questa regola per gli eventi futuri?",
                    )}
                    fields={{
                      action: "route_remove",
                      sourceId: route.sourceId,
                      destinationId: item.id,
                      eventType: route.eventType,
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
          {editable && (
            <div className="edit-grid">
              <details>
                <summary>
                  {t("Edit destination", "Modifica destinazione")}
                </summary>
                <ActionForm
                  endpoint={endpoint}
                  label={t("Save destination", "Salva destinazione")}
                  fields={{ action: "destination_update", id: item.id }}
                >
                  <DestinationFields item={item} />
                  <label className="check">
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={item.enabled}
                    />{" "}
                    {t("Enabled", "Attivo")}
                  </label>
                </ActionForm>
              </details>
              {!!sources.length && (
                <details>
                  <summary>{t("Link source", "Collega sorgente")}</summary>
                  <ActionForm
                    endpoint={endpoint}
                    label={t("Save route", "Salva regola")}
                    fields={{ action: "route_save", destinationId: item.id }}
                  >
                    <SourceSelect sources={sources} />
                    <label>
                      {t(
                        "Event type (optional)",
                        "Tipo di evento (facoltativo)",
                      )}{" "}
                      <input
                        name="eventType"
                        maxLength={100}
                        placeholder={t(
                          "e.g. order.created · blank for all",
                          "Es. order.created · vuoto per tutti",
                        )}
                      />
                    </label>
                  </ActionForm>
                </details>
              )}
              {!!item.subscriptions.length && (
                <details>
                  <summary>{t("Test delivery", "Consegna di prova")}</summary>
                  <ActionForm
                    endpoint={endpoint}
                    label={t("Send test", "Invia prova")}
                    onId={"/workspace/" + organizationId + "/events/"}
                    fields={{ action: "test_delivery", destinationId: item.id }}
                  >
                    <SourceSelect
                      sources={sources.filter((source) =>
                        item.subscriptions.some(
                          (route) => route.sourceId === source.id,
                        ),
                      )}
                    />
                    <label>
                      {t("Event type", "Tipo di evento")}{" "}
                      <input
                        name="eventType"
                        required
                        maxLength={100}
                        placeholder="order.created"
                        defaultValue={
                          item.subscriptions[0].eventType || "relayhub.test"
                        }
                      />
                    </label>
                  </ActionForm>
                </details>
              )}
            </div>
          )}
        </section>
      ))}
    </>
  );
}

async function DestinationFields({
  item,
}: {
  item?: { name: string; url: string };
}) {
  const { t } = await getLocale();
  return (
    <>
      <label>
        {t("Destination name", "Nome della destinazione")}{" "}
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={item?.name}
          placeholder={t("e.g. Warehouse", "Es. Magazzino")}
        />
      </label>
      <label>
        {t("Destination URL", "URL della destinazione")}{" "}
        <input
          name="url"
          type="url"
          required
          maxLength={2048}
          defaultValue={item?.url}
          placeholder="https://api.example.com/webhook"
        />
      </label>
      <label>
        {t("Signing secret (optional)", "Chiave di firma (facoltativa)")}{" "}
        <input
          name="secret"
          type="password"
          minLength={32}
          placeholder={t(
            "Shared key, 32–128 characters",
            "Chiave condivisa, 32–128 caratteri",
          )}
          maxLength={128}
          autoComplete="new-password"
        />
      </label>
    </>
  );
}

async function SourceSelect({
  sources,
}: {
  sources: { id: string; name: string }[];
}) {
  const { t } = await getLocale();
  return (
    <label>
      {t("Source", "Sorgente")}{" "}
      <select name="sourceId" required>
        {sources.map((source) => (
          <option key={source.id} value={source.id}>
            {source.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export async function Settings({
  organizationId,
  owner,
  name,
}: {
  organizationId: string;
  owner: boolean;
  name: string;
}) {
  const { t } = await getLocale();
  const members = await database().organizationMember.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    select: { userId: true, role: true, user: { select: { email: true } } },
  });
  const endpoint = "/api/organizations/" + organizationId;
  return (
    <>
      <PageHeading
        title={t("Settings", "Impostazioni")}
        description={t(
          "Manage organization membership and roles.",
          "Gestisci i membri e i ruoli dell’organizzazione.",
        )}
      />
      <section className="panel">
        <h2>{name}</h2>
        <p className="muted">
          {t("Organization ID", "ID organizzazione")}{" "}
          <ShortId id={organizationId} />
        </p>
        {owner && (
          <ActionForm
            endpoint={endpoint}
            label={t("Rename organization", "Rinomina organizzazione")}
            fields={{ action: "organization_rename" }}
          >
            <label>
              {t("Organization name", "Nome dell’organizzazione")}{" "}
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={name}
                placeholder={t("e.g. Online store", "Es. Negozio online")}
              />
            </label>
          </ActionForm>
        )}
      </section>
      {owner && <ApiKeySettings organizationId={organizationId} />}
      <section className="panel">
        <h2>{t("Members", "Membri")}</h2>
        <ul className="routes">
          {members.map((member) => (
            <li key={member.userId}>
              <span className="break">
                {member.user.email} · {stateLabel(member.role, t)}
              </span>
              {owner && member.role !== "owner" && (
                <ActionForm
                  endpoint={endpoint}
                  label={t("Remove member", "Rimuovi membro")}
                  confirm={t(
                    "Remove this member’s access?",
                    "Vuoi revocare l’accesso a questo membro?",
                  )}
                  fields={{ action: "member_remove", id: member.userId }}
                />
              )}
            </li>
          ))}
        </ul>
        {owner && (
          <ActionForm
            endpoint={endpoint}
            label={t("Save member", "Salva membro")}
            fields={{ action: "member_save" }}
          >
            <label>
              {t("Account ID", "ID account")}{" "}
              <input
                name="accountId"
                placeholder={t(
                  "Paste the member’s account ID",
                  "Incolla l’ID account del membro",
                )}
                required
                minLength={36}
                maxLength={36}
                autoComplete="off"
                aria-describedby="member-account-help"
              />
            </label>
            <p id="member-account-help" className="muted">
              {t(
                "Ask the member for the account ID shown on their Organizations page.",
                "Chiedi al membro l’ID account che trova nella sua pagina Organizzazioni.",
              )}
            </p>
            <label>
              {t("Role", "Ruolo")}{" "}
              <select name="role">
                <option value="viewer">{t("Viewer", "Lettore")}</option>
                <option value="admin">{t("Admin", "Amministratore")}</option>
              </select>
            </label>
          </ActionForm>
        )}
      </section>
    </>
  );
}
