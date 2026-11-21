"use client";

import { useState } from "react";
import { ActionForm } from "./forms";
import { useLocale } from "./locale";
import styles from "./workspace-records.module.css";

export type TestSource = { id: string; name: string; eventTypes: string[] };
export type TestDestination = {
  id: string;
  name: string;
  sources: TestSource[];
};

export function TestDeliveryForm({
  organizationId,
  destinations,
  chooseDestination = false,
}: {
  organizationId: string;
  destinations: TestDestination[];
  chooseDestination?: boolean;
}) {
  const { t } = useLocale();
  const [selectedId, setSelectedId] = useState("");
  let destination = destinations.find((item) => item.id === selectedId);
  if (destinations.length === 1) {
    destination = destinations[0];
  }
  let formClass = "action-form";
  if (!destination) {
    formClass += " " + styles.awaitingDestination;
  }
  return (
    <ActionForm
      className={formClass}
      endpoint={"/api/organizations/" + organizationId}
      onId={"/workspace/" + organizationId + "/events/"}
      fields={{ action: "test_delivery", destinationId: destination?.id ?? "" }}
      label={t("Send test", "Invia prova")}
      disabled={!destination}
    >
      {chooseDestination && (
        <label>
          {t("Destination", "Destinazione")}
          <select
            name="destinationId"
            required
            value={destination?.id ?? ""}
            onChange={(event) => setSelectedId(event.currentTarget.value)}
          >
            {destinations.length > 1 && (
              <option value="" disabled>
                {t("Choose a destination", "Scegli una destinazione")}
              </option>
            )}
            {destinations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {destination && (
        <RouteFields key={destination.id} sources={destination.sources} />
      )}
    </ActionForm>
  );
}

function RouteFields({ sources }: { sources: TestSource[] }) {
  const { t } = useLocale();
  const [selectedId, setSelectedId] = useState(sources[0].id);
  const source = sources.find((item) => item.id === selectedId) ?? sources[0];
  const acceptsAnyType = source.eventTypes.includes("");
  return (
    <>
      <label>
        {t("Source", "Sorgente")}
        <select
          required
          name="sourceId"
          value={source.id}
          onChange={(event) => setSelectedId(event.currentTarget.value)}
        >
          {sources.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label key={source.id}>
        {t("Event type", "Tipo di evento")}
        {acceptsAnyType && (
          <input
            name="eventType"
            required
            maxLength={100}
            defaultValue="relayhub.test"
            placeholder="order.created"
          />
        )}
        {!acceptsAnyType && (
          <select name="eventType" required>
            {source.eventTypes.map((eventType) => (
              <option key={eventType}>{eventType}</option>
            ))}
          </select>
        )}
      </label>
    </>
  );
}
