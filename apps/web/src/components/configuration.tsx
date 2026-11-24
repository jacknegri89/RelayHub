import { getLocale } from "../server/locale";
import Link from "next/link";
import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import { ActionForm } from "./forms";
import { ProfileAvatar } from "./profile-avatar";
import { profileAvatar } from "../profile-avatars";
import { ApiKeySettings } from "./api-key-settings";
import { Status, stateLabel } from "./display";
import { PageHeading } from "./page-heading";
import { WorkspaceEmpty } from "./workspace-empty";
import { CreateDisclosure } from "./create-disclosure";
import {
  TestDeliveryForm,
  type TestDestination,
  type TestSource,
} from "./test-delivery-form";
import styles from "./workspace-records.module.css";

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
      {items.length > 0 && (
        <div className={styles.inventoryBar}>
          <span>
            {t("Configured sources", "Sorgenti configurate")}{" "}
            <strong>{items.length}</strong>
          </span>
          {editable && (
            <a href="#create-source">
              {t("New source", "Nuova sorgente")}{" "}
              <span aria-hidden="true">+</span>
            </a>
          )}
        </div>
      )}
      {!editable && !items.length && (
        <WorkspaceEmpty
          kind="source"
          title={t("No sources yet.", "Nessuna sorgente configurata.")}
          description={t(
            "An owner or administrator can connect a sending app. Its endpoint and received event count will appear here.",
            "Un proprietario o un amministratore può collegare un’app mittente. Qui vedrai il suo endpoint e il numero di eventi ricevuti.",
          )}
        />
      )}
      {items.length > 0 && (
        <div className={styles.inventory}>
          {items.map((item) => (
            <section
              key={item.id}
              className={styles.record}
              aria-labelledby={"source-" + item.id}
            >
              <div className={styles.recordHeader}>
                <h2 id={"source-" + item.id}>{item.name}</h2>
                <Status value={(item.enabled && "enabled") || "disabled"} />
              </div>
              <div className={styles.recordMeta}>
                <span>{sourceProviderNames[item.provider]}</span>
                <Link
                  href={
                    "/workspace/" + organizationId + "/events?source=" + item.id
                  }
                >
                  {t("Retained events", "Eventi conservati")} ·{" "}
                  {item._count.events}
                </Link>
              </div>
              <details className={styles.recordTools}>
                <summary>{t("Source details", "Dettagli sorgente")}</summary>
                <div className={styles.toolBody}>
                  <div className={styles.endpoint}>
                    <span>{t("Source URL", "URL della sorgente")}</span>
                    <code className="break">
                      {settings().RELAYHUB_BASE_URL +
                        "/api/webhooks/" +
                        item.id}
                    </code>
                  </div>
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
                            placeholder={t(
                              "e.g. Online checkout",
                              "Es. Cassa online",
                            )}
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
                </div>
              </details>
            </section>
          ))}
        </div>
      )}
      {editable && (
        <CreateDisclosure
          id="create-source"
          firstUse={!items.length}
          label={t("New source", "Nuova sorgente")}
        >
          <p className="muted">
            {t(
              "For the hosted demo, send fictional data only. A GitHub push can include commit authors’ names and email addresses. Check your test repository before connecting it.",
              "Nella demo ospitata invia solo dati fittizi. Un push GitHub può includere nomi ed email degli autori dei commit. Controlla il repository di prova prima di collegarlo.",
            )}{" "}
            <Link href="/terms">
              {t("Demo terms", "Condizioni della demo")}
            </Link>
          </p>
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
        </CreateDisclosure>
      )}
    </>
  );
}

export async function Destinations({
  organizationId,
  editable,
  prepareTest = false,
}: {
  organizationId: string;
  editable: boolean;
  prepareTest?: boolean;
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
            source: { select: { name: true, enabled: true } },
          },
          orderBy: [
            { source: { name: "asc" } },
            { sourceId: "asc" },
            { eventType: "asc" },
          ],
        },
      },
    }),
    db.webhookSource.findMany({
      where: { organizationId },
      select: { id: true, name: true, enabled: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const endpoint = "/api/organizations/" + organizationId;
  // Only subscriptions between enabled endpoints can receive a test event.
  const testDestinations = new Map<string, TestDestination>();
  if (editable) {
    for (const item of items) {
      if (!item.enabled) {
        continue;
      }
      const linkedSources = new Map<string, TestSource>();
      for (const route of item.subscriptions) {
        if (!route.source.enabled) {
          continue;
        }
        let source = linkedSources.get(route.sourceId);
        if (!source) {
          source = {
            id: route.sourceId,
            name: route.source.name,
            eventTypes: [],
          };
          linkedSources.set(source.id, source);
        }
        source.eventTypes.push(route.eventType);
      }
      if (linkedSources.size) {
        testDestinations.set(item.id, {
          id: item.id,
          name: item.name,
          sources: Array.from(linkedSources.values()),
        });
      }
    }
  }
  if (editable && prepareTest) {
    const listPath = "/workspace/" + organizationId + "/destinations";
    return (
      <>
        <PageHeading
          title={t("Prepare a test delivery", "Prepara una consegna di prova")}
        />
        {testDestinations.size > 0 && (
          <section className="panel">
            <p>
              {t(
                "Choose a route. When you select Send test, RelayHub sends a sample event only to that destination.",
                "Scegli una regola di inoltro. Quando premi Invia prova, RelayHub invia un evento di esempio solo alla destinazione scelta.",
              )}
            </p>
            <TestDeliveryForm
              organizationId={organizationId}
              destinations={Array.from(testDestinations.values())}
              chooseDestination
            />
          </section>
        )}
        {!testDestinations.size && (
          <WorkspaceEmpty
            kind="destination"
            title={t(
              "No routes ready for a test",
              "Nessuna regola pronta per la prova",
            )}
            description={t(
              "To test a delivery, link an enabled source to an enabled destination.",
              "Per provare una consegna, collega una sorgente attiva a una destinazione attiva.",
            )}
          />
        )}
        <p>
          <Link href={listPath}>
            {t("Back to destinations", "Torna alle destinazioni")}
          </Link>
        </p>
      </>
    );
  }
  return (
    <>
      <PageHeading
        title={t("Destinations", "Destinazioni")}
        description={t(
          "Manage receivers and choose which events they get.",
          "Configura i destinatari e scegli gli eventi che ricevono.",
        )}
      />
      {items.length > 0 && (
        <div className={styles.inventoryBar}>
          <span>
            {t("Configured destinations", "Destinazioni configurate")}{" "}
            <strong>{items.length}</strong>
          </span>
          {editable && (
            <div className={styles.inventoryActions}>
              {testDestinations.size > 0 && (
                <Link href="?task=test">
                  {t(
                    "Prepare a test delivery",
                    "Prepara una consegna di prova",
                  )}
                </Link>
              )}
              <a href="#create-destination">
                {t("New destination", "Nuova destinazione")}{" "}
                <span aria-hidden="true">+</span>
              </a>
            </div>
          )}
        </div>
      )}
      {!editable && !items.length && (
        <WorkspaceEmpty
          kind="destination"
          title={t("No destinations yet.", "Nessuna destinazione configurata.")}
          description={t(
            "An owner or administrator can connect a receiving app. Its routes, delivery history and alerts will appear here.",
            "Un proprietario o un amministratore può collegare un’app destinataria. Qui vedrai le sue regole di inoltro, lo storico e gli avvisi.",
          )}
        />
      )}
      {items.length > 0 && (
        <div className={styles.inventory}>
          {items.map((item) => (
            <section
              key={item.id}
              className={styles.record}
              aria-labelledby={"destination-" + item.id}
            >
              <div className={styles.recordHeader}>
                <h2 id={"destination-" + item.id}>{item.name}</h2>
                <Status value={(item.enabled && "enabled") || "disabled"} />
              </div>
              <div className={styles.recordMeta}>
                <span>
                  {t("Routes", "Regole di inoltro")} ·{" "}
                  {item.subscriptions.length}
                </span>
                <Link
                  href={
                    "/workspace/" + organizationId + "/destinations/" + item.id
                  }
                >
                  {t(
                    "View seven-day history and alerts",
                    "Vedi storico di 7 giorni e avvisi",
                  )}
                </Link>
              </div>
              <details className={styles.recordTools}>
                <summary>
                  {t("Endpoint and routes", "Endpoint e regole")}
                </summary>
                <div className={styles.toolBody}>
                  <div className={styles.endpoint}>
                    <span>{t("Receiver URL", "URL del destinatario")}</span>
                    <code className="break">{item.url}</code>
                  </div>
                  {!item.subscriptions.length && (
                    <p className="muted">
                      {t(
                        "No sources are linked.",
                        "Nessuna sorgente collegata.",
                      )}
                      {editable && !sources.length && (
                        <>
                          {" "}
                          <Link
                            href={
                              "/workspace/" +
                              organizationId +
                              "/sources#create-source"
                            }
                          >
                            {t(
                              "Create a source to route events here.",
                              "Crea una sorgente per inoltrare eventi qui.",
                            )}
                          </Link>
                        </>
                      )}
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
                          <summary>
                            {t("Link source", "Collega sorgente")}
                          </summary>
                          <ActionForm
                            endpoint={endpoint}
                            label={t("Save route", "Salva regola")}
                            fields={{
                              action: "route_save",
                              destinationId: item.id,
                            }}
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
                        <DestinationTest
                          organizationId={organizationId}
                          enabled={item.enabled}
                          destination={testDestinations.get(item.id)}
                        />
                      )}
                    </div>
                  )}
                </div>
              </details>
            </section>
          ))}
        </div>
      )}
      {editable && (
        <CreateDisclosure
          id="create-destination"
          firstUse={!items.length}
          label={t("New destination", "Nuova destinazione")}
        >
          {!items.length && (
            <p className="muted">
              {t(
                "Enter the URL of the app that should receive webhooks. Then link a source to choose which events reach it.",
                "Inserisci l’URL dell’app che deve ricevere i webhook. Poi collega una sorgente per scegliere quali eventi inoltrare.",
              )}
            </p>
          )}
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
        </CreateDisclosure>
      )}
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

async function DestinationTest({
  organizationId,
  enabled,
  destination,
}: {
  organizationId: string;
  enabled: boolean;
  destination?: TestDestination;
}) {
  const { t } = await getLocale();
  if (!enabled) {
    return (
      <p className="muted">
        {t(
          "Enable this destination to send a test delivery.",
          "Attiva questa destinazione per inviare una consegna di prova.",
        )}
      </p>
    );
  }
  if (!destination) {
    return (
      <p className="muted">
        {t(
          "Enable a linked source to send a test delivery.",
          "Attiva una sorgente collegata per inviare una consegna di prova.",
        )}
      </p>
    );
  }
  return (
    <details>
      <summary>{t("Test delivery", "Consegna di prova")}</summary>
      <TestDeliveryForm
        organizationId={organizationId}
        destinations={[destination]}
      />
    </details>
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
  deletionToken,
}: {
  organizationId: string;
  owner: boolean;
  name: string;
  deletionToken?: string;
}) {
  const { t } = await getLocale();
  const members = await database().organizationMember.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    select: {
      userId: true,
      role: true,
      user: { select: { email: true, name: true, image: true } },
    },
  });
  const endpoint = "/api/organizations/" + organizationId;
  return (
    <>
      <PageHeading
        title={t("Settings", "Impostazioni")}
        description={t(
          "Manage organization details, members and access.",
          "Gestisci i dati, i membri e gli accessi dell’organizzazione.",
        )}
      />
      <nav
        className={styles.settingsNav}
        aria-label={t("Settings sections", "Sezioni delle impostazioni")}
      >
        <a href="#organization">{t("Organization", "Organizzazione")}</a>
        <a href="#members">{t("Members", "Membri")}</a>
        {owner && <a href="#api-keys">{t("API keys", "Chiavi API")}</a>}
        {deletionToken && (
          <a href="#delete-organization">
            {t("Delete organization", "Elimina organizzazione")}
          </a>
        )}
      </nav>
      <section className="panel" id="organization">
        <h2>{name}</h2>
        <p className="muted">
          {t("Organization ID", "ID organizzazione")}{" "}
          <code className={styles.identifier}>{organizationId}</code>
        </p>
        {owner && (
          <details className={styles.task}>
            <summary>
              {t(
                "Edit organization name",
                "Modifica il nome dell’organizzazione",
              )}
            </summary>
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
          </details>
        )}
      </section>
      <section className="panel" id="members">
        <h2>
          {t("Members", "Membri")}{" "}
          <span className={styles.quantity}>{members.length}</span>
        </h2>
        <ul className="routes">
          {members.map((member) => (
            <li key={member.userId}>
              <span className={styles.member}>
                <ProfileAvatar
                  name={member.user.name}
                  avatar={profileAvatar(member.user.image)}
                  small
                />
                <span className={styles.memberIdentity}>
                  <strong>{member.user.name}</strong>
                  <span>{member.user.email}</span>
                </span>
                <small>{stateLabel(member.role, t)}</small>
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
          <details className={styles.task}>
            <summary>
              {t(
                "Add a member or change their role",
                "Aggiungi un membro o modifica il suo ruolo",
              )}
            </summary>
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
          </details>
        )}
      </section>
      {owner && (
        <div id="api-keys">
          <ApiKeySettings organizationId={organizationId} />
        </div>
      )}
      {deletionToken && (
        <OrganizationDeletion
          endpoint={endpoint}
          name={name}
          token={deletionToken}
        />
      )}
    </>
  );
}

async function OrganizationDeletion({
  endpoint,
  name,
  token,
}: {
  endpoint: string;
  name: string;
  token: string;
}) {
  const { t } = await getLocale();
  return (
    <section
      className="panel"
      id="delete-organization"
      aria-labelledby="delete-organization-title"
    >
      <h2 id="delete-organization-title">
        {t("Delete organization", "Elimina organizzazione")}
      </h2>
      <p className="muted">
        {t(
          "Permanently remove this organization, its sources, destinations, routes, delivery history and API keys. Members lose access to this workspace.",
          "Elimina definitivamente l’organizzazione, le sorgenti, le destinazioni, le regole, lo storico delle consegne e le chiavi API. I membri perdono l’accesso a quest’area di lavoro.",
        )}
      </p>
      <details className={styles.task}>
        <summary>{t("Review deletion", "Rivedi l’eliminazione")}</summary>
        <ActionForm
          className={"action-form " + styles.organizationDeletion}
          endpoint={endpoint}
          fields={{ action: "organization_delete", csrfToken: token }}
          label={t("Delete permanently", "Elimina definitivamente")}
          nextPath="/workspace"
        >
          <label>
            {t("Organization name", "Nome dell’organizzazione")}
            <input
              name="confirmation"
              required
              maxLength={80}
              autoComplete="off"
              aria-describedby="organization-deletion-hint"
            />
          </label>
          <p id="organization-deletion-hint" className="muted">
            {t(
              "Enter the name exactly as shown:",
              "Inserisci il nome esattamente come mostrato:",
            )}{" "}
            <strong>{name}</strong>
          </p>
        </ActionForm>
      </details>
    </section>
  );
}
