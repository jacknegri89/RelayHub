"use client";

import Link from "next/link";
import { useRef } from "react";
import type { LostResponseReport } from "../lost-response-report";
import { useLocale } from "./locale";
import { useLostResponse } from "./use-lost-response";
import styles from "./lost-response-test.module.css";

type Attempt = LostResponseReport["attempts"][number];
type Translate = ReturnType<typeof useLocale>["t"];
type Monitor = ReturnType<typeof useLostResponse>;

function measuredStatus(status: string, t: Translate) {
  const labels: Record<string, string> = {
    pending: t("Pending", "In attesa"),
    queued: t("Queued", "In coda"),
    delivering: t("Delivering", "In consegna"),
    retry_scheduled: t("Retry scheduled", "Nuovo tentativo programmato"),
    delivered: t("Delivered", "Consegnata"),
    failed: t("Failed", "Fallita"),
    cancelled: t("Cancelled", "Annullata"),
    in_progress: t("In progress", "In corso"),
    success: t("Succeeded", "Riuscito"),
    retry: t("Retryable failure", "Errore riprovabile"),
    http_error: t("HTTP error", "Errore HTTP"),
    lease_expired: t("Worker lease expired", "Tempo di elaborazione scaduto"),
    policy_blocked: t(
      "Blocked by policy",
      "Bloccato dalle regole di sicurezza",
    ),
    disabled: t("Disabled", "Disattivato"),
    decryption_error: t("Decryption error", "Errore di decifratura"),
  };
  return labels[status] ?? status;
}

export function Timestamp({ value }: { value: string }) {
  const { locale } = useLocale();
  const format = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    timeZone: "UTC",
    hourCycle: "h23",
  });
  return <time dateTime={value}>{format.format(new Date(value))} UTC</time>;
}

function AttemptDetails({ attempt }: { attempt: Attempt }) {
  const { t, locale } = useLocale();
  let response = t("Awaiting response", "In attesa di risposta");
  if (attempt.finishedAt) {
    response = t(
      "No HTTP response recorded",
      "Nessuna risposta HTTP registrata",
    );
  }
  if (attempt.httpStatus !== null) {
    response = "HTTP " + attempt.httpStatus;
  }
  return (
    <details className={styles.attempt}>
      <summary>
        <strong>
          {t("Attempt", "Tentativo")} {attempt.number}
        </strong>
        <span>{response}</span>
      </summary>
      <dl>
        <div className={styles.deliveryKey}>
          <dt>{t("Delivery ID", "ID consegna")}</dt>
          <dd>
            <code>{attempt.deliveryId}</code>
          </dd>
        </div>
        <div>
          <dt>{t("Started", "Inizio")}</dt>
          <dd>
            <Timestamp value={attempt.startedAt} />
          </dd>
        </div>
        {attempt.finishedAt && (
          <div>
            <dt>{t("Finished", "Fine")}</dt>
            <dd>
              <Timestamp value={attempt.finishedAt} />
            </dd>
          </div>
        )}
        <div>
          <dt>{t("Worker outcome", "Esito del worker")}</dt>
          <dd>{measuredStatus(attempt.outcome, t)}</dd>
        </div>
        <div>
          <dt>{t("HTTP response", "Risposta HTTP")}</dt>
          <dd>{response}</dd>
        </div>
        {attempt.durationMs !== null && (
          <div>
            <dt>{t("Duration", "Durata")}</dt>
            <dd>
              {new Intl.NumberFormat(locale).format(attempt.durationMs)} ms
            </dd>
          </div>
        )}
      </dl>
    </details>
  );
}

export function RunEvidence({ report }: { report: LostResponseReport | null }) {
  const { t } = useLocale();
  const attempts = [...(report?.attempts ?? [])].sort(
    (a, b) => a.number - b.number,
  );
  return (
    <div className={styles.evidence}>
      <section aria-labelledby="attempt-list-title" className={styles.log}>
        <h2 id="attempt-list-title">
          {t("Delivery attempts", "Tentativi di consegna")}
        </h2>
        {!report && (
          <p>
            {t(
              "Each attempt will show its start time, HTTP response and delivery ID. Open two attempts to compare them.",
              "Ogni tentativo mostrerà l’ora di inizio, la risposta HTTP e l’ID di consegna. Aprine due per confrontarli.",
            )}
          </p>
        )}
        {report && attempts.length === 0 && (
          <p>
            {t(
              "The worker has not recorded an attempt yet.",
              "Il worker deve ancora registrare un tentativo.",
            )}
          </p>
        )}
        {attempts.map((attempt) => (
          <AttemptDetails key={attempt.number} attempt={attempt} />
        ))}
      </section>
      <section
        aria-label={t("Receiver", "Destinatario")}
        className={styles.receipt}
      >
        <h2>{t("Receiver", "Destinatario")}</h2>
        {!report && (
          <p>
            {t(
              "The receiver counts each signed request. It uses the delivery ID to save the order once, even if the sender retries.",
              "Il destinatario conta ogni richiesta firmata. Usa l’ID di consegna per salvare l’ordine una volta sola, anche quando il mittente riprova.",
            )}
          </p>
        )}
        {report && (
          <>
            <dl className={styles.counts}>
              <div>
                <dt>{t("Requests received", "Richieste ricevute")}</dt>
                <dd>
                  <output
                    aria-label={t("Requests received", "Richieste ricevute")}
                  >
                    {report.requestsReceived}
                  </output>
                </dd>
              </div>
              <div>
                <dt>{t("Orders saved", "Ordini salvati")}</dt>
                <dd>
                  <output aria-label={t("Orders saved", "Ordini salvati")}>
                    {report.ordersSaved}
                  </output>
                </dd>
              </div>
            </dl>
            {report.orderSavedAt && (
              <p>
                {t("Saved at", "Salvato il")}{" "}
                <Timestamp value={report.orderSavedAt} />
              </p>
            )}
            <p className={styles.receiverNote}>
              {t(
                "Counts read from the receiver for this delivery ID.",
                "Conteggi letti dal destinatario per questo ID di consegna.",
              )}
            </p>
          </>
        )}
      </section>
    </div>
  );
}

export function monitorMessage(
  monitor: Pick<Monitor, "phase" | "issue" | "report">,
  t: Translate,
) {
  const { phase, issue, report } = monitor;
  const messages: Record<Monitor["issue"], string> = {
    none: "",
    access: t(
      "Open the dashboard from the tab where you started this test.",
      "Apri la dashboard dalla scheda in cui hai avviato questa prova.",
    ),
    connection: t(
      "Connection interrupted. The last reading is still shown.",
      "Connessione interrotta. Rimane visibile l’ultima lettura disponibile.",
    ),
    unavailable: t(
      "The service is temporarily unavailable.",
      "Il servizio è temporaneamente indisponibile.",
    ),
    limit: t(
      "Request limit reached. Wait for the server’s retry interval.",
      "Limite di richieste raggiunto. Attendi l’intervallo indicato dal server.",
    ),
    missing: t(
      "This test has expired or is no longer available.",
      "Questa prova è scaduta o non è più disponibile.",
    ),
    unconfirmed: t(
      "This test could not be found. Resume to retry the same request.",
      "La prova non è stata trovata. Riprendi per ritentare con lo stesso ID.",
    ),
    proof: t(
      "Reload the page to refresh the form before trying again.",
      "Ricarica la pagina per aggiornare il modulo prima di riprovare.",
    ),
    other: t(
      "The service could not confirm the request.",
      "Il servizio non ha potuto confermare la richiesta.",
    ),
  };
  if (issue !== "none") {
    return messages[issue];
  }
  if (phase === "finished" && report) {
    return measuredStatus(report.status, t);
  }
  if (phase === "paused") {
    return t("Automatic updates paused.", "Aggiornamenti automatici in pausa.");
  }
  if (report) {
    return measuredStatus(report.status, t);
  }
  if (phase === "watching") {
    return t(
      "Waiting for the first reading…",
      "In attesa della prima lettura…",
    );
  }
  return t("Ready to send a test order.", "Puoi inviare un ordine di prova.");
}

export function LostResponseTest({
  formProof,
  minFormTimeMs,
}: {
  formProof: string;
  minFormTimeMs: number;
}) {
  const { t } = useLocale();
  const monitor = useLostResponse(formProof, minFormTimeMs);
  const trap = useRef<HTMLInputElement>(null);
  const { phase, issue, report, ready } = monitor;
  const isPaused = phase === "paused";
  const canResume = isPaused && issue !== "missing" && issue !== "proof";
  const canRepeat = phase === "finished" || (isPaused && issue !== "proof");
  return (
    <main className={styles.main} id="main">
      <Link className={styles.back} href="/#simulator">
        ← {t("Back to the simulator", "Torna al simulatore")}
      </Link>
      <div className={styles.intro}>
        <h1>{t("Try a lost response", "Prova una risposta persa")}</h1>
        <p>
          {t(
            "Send an order to a receiver that saves it and delays its first reply. When RelayHub retries, compare the delivery ID on both attempts with the number of orders the receiver saved.",
            "Invia un ordine a un destinatario che lo salva e ritarda la prima risposta. Quando RelayHub riprova, confronta l’ID dei due tentativi con il numero di ordini salvati dal destinatario.",
          )}
        </p>
      </div>
      <div className={styles.controls}>
        <div
          className={styles.indicator}
          role="status"
          aria-atomic="true"
          data-phase={phase}
        >
          {monitorMessage(monitor, t)}
          {isPaused && issue !== "none" && issue !== "proof" && (
            <small>
              {t(
                "Automatic updates paused.",
                "Aggiornamenti automatici in pausa.",
              )}
            </small>
          )}
        </div>
        <div className={styles.buttons}>
          <label aria-hidden="true" className={styles.trap}>
            {t("Company website", "Sito aziendale")}
            <input name="website" autoComplete="off" ref={trap} tabIndex={-1} />
          </label>
          {report && (
            <Link
              className={styles.dashboardLink}
              href={"/lost-response/dashboard/" + report.runId}
            >
              {t(
                "Open this test in the dashboard",
                "Apri questa prova nella dashboard",
              )}
              <span aria-hidden="true"> →</span>
            </Link>
          )}
          {phase === "idle" && (
            <button
              type="button"
              disabled={!ready}
              onClick={() => monitor.begin(true, trap.current?.value ?? "")}
            >
              {t("Start the test", "Avvia la prova")}
            </button>
          )}
          {canResume && (
            <button
              type="button"
              disabled={!ready}
              onClick={() => monitor.begin(false, trap.current?.value ?? "")}
            >
              {t("Resume updates", "Riprendi gli aggiornamenti")}
            </button>
          )}
          {issue === "proof" && (
            <button type="button" onClick={() => window.location.reload()}>
              {t("Reload page", "Ricarica la pagina")}
            </button>
          )}
          {canRepeat && (
            <button
              type="button"
              className={styles.repeat}
              disabled={!ready}
              onClick={() => monitor.begin(true, trap.current?.value ?? "")}
            >
              {t("Start a new test", "Avvia una nuova prova")}
            </button>
          )}
        </div>
      </div>
      <RunEvidence report={report} />
    </main>
  );
}
