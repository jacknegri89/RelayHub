"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useLocale } from "./locale";
import styles from "./recovery-selection.module.css";

type Row = {
  id: string;
  externalId: string;
  eventType: string;
  time: string;
  outcome: string;
};
type Receipt = { queued: Row[]; skipped: number };

export function RecoverySelection({
  organizationId,
  destinationId,
  incidentId,
  rows,
  editable,
}: {
  organizationId: string;
  destinationId: string;
  incidentId: string;
  rows: Row[];
  editable: boolean;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [selection, setSelection] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const selected = rows.filter((row) => selection.includes(row.id));
  const base = "/workspace/" + organizationId + "/deliveries/";

  async function retry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !editable || !selected.length) {
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/organizations/" + organizationId, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "delivery_retry_group",
          destinationId,
          incidentId,
          deliveryIds: selected.map((row) => row.id),
        }),
      });
      if (!response.ok) {
        let message = t(
          "Retry failed. Refresh the list and try again.",
          "Reinvio non riuscito. Aggiorna l’elenco e riprova.",
        );
        if (response.status === 409) {
          message = t(
            "The destination is unavailable. Check its status before retrying.",
            "Destinazione non disponibile. Controlla lo stato prima di riprovare.",
          );
        }
        if (response.status === 429) {
          message = t(
            "Too many requests. Wait a minute before retrying.",
            "Troppe richieste. Attendi un minuto prima di riprovare.",
          );
        }
        setError(message);
      } else {
        const result: { queued: string[]; skipped: number } =
          await response.json();
        setReceipt({
          queued: selected.filter((row) => result.queued.includes(row.id)),
          skipped: result.skipped,
        });
        setSelection([]);
      }
      router.refresh();
    } catch {
      setError(
        t(
          "Could not reach RelayHub. Try again.",
          "Connessione a RelayHub non riuscita. Riprova.",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  let buttonLabel = t(
    "Retry selected deliveries",
    "Reinvia le consegne selezionate",
  );
  if (pending) {
    buttonLabel = t("Queuing deliveries…", "Accodamento in corso…");
  }
  return (
    <form onSubmit={retry} className={styles.form}>
      {rows.length > 0 && editable && (
        <label className={styles.selectPage}>
          <input
            type="checkbox"
            checked={selected.length === rows.length}
            disabled={pending}
            onChange={(event) => {
              if (event.target.checked) {
                setSelection(rows.map((row) => row.id));
              } else {
                setSelection([]);
              }
            }}
          />
          {t("Select this page", "Seleziona questa pagina")}
        </label>
      )}
      <ul className={styles.list}>
        {rows.map((row) => (
          <li key={row.id}>
            {editable && (
              <input
                type="checkbox"
                aria-label={row.externalId}
                checked={selection.includes(row.id)}
                disabled={pending}
                onChange={(event) => {
                  if (event.target.checked) {
                    setSelection((current) => [...current, row.id]);
                  } else {
                    setSelection((current) =>
                      current.filter((id) => id !== row.id),
                    );
                  }
                }}
              />
            )}
            <div className={styles.event}>
              <Link href={base + row.id}>{row.externalId}</Link>
              <small>{row.eventType}</small>
            </div>
            <div className={styles.result}>
              <strong>{row.outcome}</strong>
              <small>{row.time}</small>
            </div>
          </li>
        ))}
      </ul>
      {rows.length > 0 && editable && (
        <button type="submit" disabled={pending || selected.length === 0}>
          {buttonLabel}
        </button>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {receipt && (
        <div role="status">
          <p>
            {t("Queued", "Accodate")} · {receipt.queued.length}.{" "}
            {t("Skipped", "Saltate")} · {receipt.skipped}.
          </p>
          {receipt.queued.length > 0 && (
            <details>
              <summary>
                {t("Track these deliveries", "Segui queste consegne")}
              </summary>
              <ul>
                {receipt.queued.map((row) => (
                  <li key={row.id}>
                    <Link href={base + row.id}>{row.externalId}</Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </form>
  );
}
