import { database } from "@relayhub/db";
import { settings } from "@relayhub/shared/config";
import { ActionForm } from "./forms";
import { Status, ShortId } from "./display";
import { PageHeading } from "./page-heading";

export async function Sources({
  organizationId,
  editable,
}: {
  organizationId: string;
  editable: boolean;
}) {
  const items = await database().webhookSource.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      enabled: true,
      _count: { select: { events: true } },
    },
  });
  const endpoint = "/api/organizations/" + organizationId;
  return (
    <>
      <PageHeading
        title="Sources"
        description="Manage public endpoints for signed webhooks."
      />
      {editable && (
        <section className="panel">
          <h2>Create source</h2>
          <ActionForm
            endpoint={endpoint}
            label="Create source"
            fields={{ action: "source_create" }}
          >
            <label>
              Source name <input name="name" required maxLength={80} />
            </label>
          </ActionForm>
        </section>
      )}
      {!items.length && <p className="empty">No sources yet.</p>}
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
          <p className="muted">{item._count.events} retained events</p>
          {editable && (
            <div className="edit-grid">
              <ActionForm
                endpoint={endpoint}
                label="Save source"
                fields={{ action: "source_update", id: item.id }}
              >
                <label>
                  Source name{" "}
                  <input
                    name="name"
                    required
                    maxLength={80}
                    defaultValue={item.name}
                  />
                </label>
                <label className="check">
                  <input
                    name="enabled"
                    type="checkbox"
                    defaultChecked={item.enabled}
                  />{" "}
                  Enabled
                </label>
              </ActionForm>
              <ActionForm
                endpoint={endpoint}
                label="Rotate signing secret"
                fields={{ action: "source_rotate", id: item.id }}
                confirm="Rotate this source secret? Update the sender before it sends another webhook."
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
        title="Destinations"
        description="Manage receivers and choose which events they get."
      />
      {editable && (
        <section className="panel">
          <h2>Create destination</h2>
          <ActionForm
            endpoint={endpoint}
            label="Create destination"
            fields={{ action: "destination_create" }}
          >
            <DestinationFields />
          </ActionForm>
          {settings().HOSTED_DEMO_SECRET && !settings().isDemo && (
            <p className="muted">
              Hosted demo receiver{" "}
              <code className="break">
                {settings().RELAYHUB_BASE_URL + "/api/demo/receiver/success"}
              </code>
            </p>
          )}
          {settings().DEMO_RECEIVER_URL && (
            <p className="muted">
              Demo receiver:{" "}
              <code className="break">
                {settings().DEMO_RECEIVER_URL + "/hooks/success"}
              </code>
            </p>
          )}
        </section>
      )}
      {!items.length && <p className="empty">No destinations yet.</p>}
      {items.map((item) => (
        <section key={item.id} className="panel">
          <div className="section-head">
            <h2>{item.name}</h2>
            <Status value={(item.enabled && "enabled") || "disabled"} />
          </div>
          <p>
            <code className="break">{item.url}</code>
          </p>
          <h3>Routes</h3>
          {!item.subscriptions.length && (
            <p className="muted">No sources are linked.</p>
          )}
          <ul className="routes">
            {item.subscriptions.map((route) => (
              <li key={route.sourceId + ":" + route.eventType}>
                <span>
                  {route.source.name}{" "}
                  <code>{route.eventType || "all event types"}</code>
                </span>
                {editable && (
                  <ActionForm
                    endpoint={endpoint}
                    label="Remove route"
                    confirm="Remove this route for future events?"
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
                <summary>Edit destination</summary>
                <ActionForm
                  endpoint={endpoint}
                  label="Save destination"
                  fields={{ action: "destination_update", id: item.id }}
                >
                  <DestinationFields item={item} />
                  <label className="check">
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={item.enabled}
                    />{" "}
                    Enabled
                  </label>
                </ActionForm>
              </details>
              {!!sources.length && (
                <details>
                  <summary>Link source</summary>
                  <ActionForm
                    endpoint={endpoint}
                    label="Save route"
                    fields={{ action: "route_save", destinationId: item.id }}
                  >
                    <SourceSelect sources={sources} />
                    <label>
                      Event type (optional){" "}
                      <input
                        name="eventType"
                        maxLength={100}
                        placeholder="All event types"
                      />
                    </label>
                  </ActionForm>
                </details>
              )}
              {!!item.subscriptions.length && (
                <details>
                  <summary>Test delivery</summary>
                  <ActionForm
                    endpoint={endpoint}
                    label="Send test"
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
                      Event type{" "}
                      <input
                        name="eventType"
                        required
                        maxLength={100}
                        defaultValue={
                          item.subscriptions[0].eventType || "demo.test"
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

function DestinationFields({ item }: { item?: { name: string; url: string } }) {
  return (
    <>
      <label>
        Destination name{" "}
        <input name="name" required maxLength={80} defaultValue={item?.name} />
      </label>
      <label>
        Destination URL{" "}
        <input
          name="url"
          type="url"
          required
          maxLength={2048}
          defaultValue={item?.url}
        />
      </label>
      <label>
        Signing secret (optional){" "}
        <input
          name="secret"
          type="password"
          minLength={32}
          maxLength={128}
          autoComplete="new-password"
        />
      </label>
    </>
  );
}

function SourceSelect({
  sources,
}: {
  sources: { id: string; name: string }[];
}) {
  return (
    <label>
      Source{" "}
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
  const members = await database().organizationMember.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    select: { userId: true, role: true, user: { select: { email: true } } },
  });
  const endpoint = "/api/organizations/" + organizationId;
  return (
    <>
      <PageHeading
        title="Settings"
        description="Manage organization membership and roles."
      />
      <section className="panel">
        <h2>{name}</h2>
        <p className="muted">
          Organization ID <ShortId id={organizationId} />
        </p>
        {owner && (
          <ActionForm
            endpoint={endpoint}
            label="Rename organization"
            fields={{ action: "organization_rename" }}
          >
            <label>
              Organization name{" "}
              <input name="name" required maxLength={80} defaultValue={name} />
            </label>
          </ActionForm>
        )}
      </section>
      <section className="panel">
        <h2>Members</h2>
        <ul className="routes">
          {members.map((member) => (
            <li key={member.userId}>
              <span className="break">
                {member.user.email} · {member.role}
              </span>
              {owner && member.role !== "owner" && (
                <ActionForm
                  endpoint={endpoint}
                  label="Remove member"
                  confirm="Remove this member’s access?"
                  fields={{ action: "member_remove", id: member.userId }}
                />
              )}
            </li>
          ))}
        </ul>
        {owner && (
          <ActionForm
            endpoint={endpoint}
            label="Save member"
            fields={{ action: "member_save" }}
          >
            <label>
              Account ID{" "}
              <input
                name="accountId"
                required
                minLength={36}
                maxLength={36}
                autoComplete="off"
                aria-describedby="member-account-help"
              />
            </label>
            <p id="member-account-help" className="muted">
              Ask the member for the account ID shown on their Organizations
              page.
            </p>
            <label>
              Role{" "}
              <select name="role">
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </ActionForm>
        )}
      </section>
    </>
  );
}
