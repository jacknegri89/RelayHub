import { getLocale } from "../../../../server/locale";
import { headers } from "next/headers";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { can } from "@relayhub/shared/access";
import { requireOrganization } from "../../../../server/authorization";
import { HttpError } from "../../../../server/http";
import { FailedAttemptsPage } from "../../../../components/failed-attempts";
import { RecoveryDeliveries } from "../../../../components/recovery-deliveries";
import {
  Overview,
  Events,
  Deliveries,
  EventDetail,
  DeliveryDetail,
} from "../../../../components/activity";
import {
  Sources,
  Destinations,
  Settings,
} from "../../../../components/configuration";
import {
  DestinationAlertPage,
  DestinationDetail,
} from "../../../../components/destination-alerts";

export type Query = Record<string, string | string[] | undefined>;

export default async function OrganizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string; section?: string[] }>;
  searchParams: Promise<Query>;
}) {
  const { organizationId, section = [] } = await params;
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
  const role = access.membership.role;
  const editable = can(role, "configure");
  const owner = can(role, "manage_members");

  if (!section.length) {
    return (
      <LoadingSection>
        <Overview organizationId={organizationId} editable={editable} />
      </LoadingSection>
    );
  }
  if (section.length === 2 && section[0] === "events") {
    return <EventDetail organizationId={organizationId} id={section[1]} />;
  }
  if (
    section.length === 3 &&
    section[0] === "destinations" &&
    section[2] === "attempts"
  ) {
    return (
      <FailedAttemptsPage
        organizationId={organizationId}
        id={section[1]}
        query={await searchParams}
      />
    );
  }
  if (
    section.length === 3 &&
    section[0] === "destinations" &&
    section[2] === "recovery"
  ) {
    const { incident, after } = await searchParams;
    if (Array.isArray(incident) || Array.isArray(after)) {
      notFound();
    }
    return (
      <RecoveryDeliveries
        organizationId={organizationId}
        destinationId={section[1]}
        incidentId={incident}
        after={after}
        editable={editable}
      />
    );
  }
  if (section.length === 2 && section[0] === "destinations") {
    const { day } = await searchParams;
    let initialDay: string | undefined;
    if (typeof day === "string") {
      initialDay = day;
    }
    return (
      <DestinationDetail
        organizationId={organizationId}
        id={section[1]}
        initialDay={initialDay}
        userId={access.session.user.id}
        email={access.session.user.email}
      />
    );
  }
  if (section.length === 2 && section[0] === "deliveries") {
    return (
      <DeliveryDetail
        organizationId={organizationId}
        id={section[1]}
        editable={editable}
      />
    );
  }
  if (section.length !== 1) {
    notFound();
  }
  switch (section[0]) {
    case "alerts":
      return (
        <LoadingSection>
          <DestinationAlertPage
            organizationId={organizationId}
            query={await searchParams}
          />
        </LoadingSection>
      );
    case "sources":
      return (
        <LoadingSection>
          <Sources organizationId={organizationId} editable={editable} />
        </LoadingSection>
      );
    case "destinations": {
      const { task } = await searchParams;
      return (
        <LoadingSection>
          <Destinations
            organizationId={organizationId}
            editable={editable}
            prepareTest={editable && task === "test"}
          />
        </LoadingSection>
      );
    }
    case "events":
      return (
        <LoadingSection>
          <Events organizationId={organizationId} query={await searchParams} />
        </LoadingSection>
      );
    case "deliveries":
      return (
        <LoadingSection>
          <Deliveries
            organizationId={organizationId}
            query={await searchParams}
          />
        </LoadingSection>
      );
    case "settings":
      return (
        <LoadingSection>
          <Settings
            organizationId={organizationId}
            owner={owner}
            name={access.membership.organization.name}
          />
        </LoadingSection>
      );
    default:
      notFound();
  }
}

async function LoadingSection({ children }: { children: React.ReactNode }) {
  const { t } = await getLocale();
  return (
    <Suspense
      fallback={
        <p className="loading" role="status">
          {t("Loading workspace…", "Caricamento dell’area di lavoro…")}
        </p>
      }
    >
      {children}
    </Suspense>
  );
}
