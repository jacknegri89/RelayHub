"use client";

import { useId, useRef, useState } from "react";
import { useLocale } from "./locale";
import styles from "./api-explorer.module.css";

type Translate = ReturnType<typeof useLocale>["t"];

function readRequests(t: Translate) {
  return [
    {
      label: t("GitHub pushes", "Push GitHub"),
      path: "/api/v1/events",
      filter: "eventType=github.push",
      result: t(
        "List events of type github.push with their source and receipt time. For a webhook from GitHub, the external ID is GitHub’s delivery ID.",
        "Elenca gli eventi di tipo github.push con la sorgente e l’ora di ricezione. Per un webhook inviato da GitHub, l’ID esterno corrisponde all’ID della consegna su GitHub.",
      ),
    },
    {
      label: t("Failed deliveries", "Consegne fallite"),
      path: "/api/v1/deliveries",
      filter: "status=failed",
      result: t(
        "Find deliveries that ended in failure. Each item includes the destination ID, the attempt count and the last HTTP status when the receiver responded.",
        "Trova le consegne terminate con un errore. Ogni voce riporta l’ID della destinazione, il numero di tentativi e l’ultimo stato HTTP, se il destinatario ha risposto.",
      ),
    },
    {
      label: t("Scheduled retries", "Tentativi programmati"),
      path: "/api/v1/deliveries",
      filter: "status=retry_scheduled",
      result: t(
        "Find deliveries waiting for an automatic retry. The event ID, destination ID and attempt count tell you which delivery is waiting and how many attempts have already run.",
        "Trova le consegne in attesa di un nuovo tentativo automatico. L’ID dell’evento, quello della destinazione e il numero di tentativi indicano quale consegna è in attesa e quante volte è già stata tentata.",
      ),
    },
  ];
}

function ReadCommand({
  request,
}: {
  request: ReturnType<typeof readRequests>[number];
}) {
  const { t } = useLocale();
  const codeRef = useRef<HTMLElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">(
    "idle",
  );
  const command = [
    'curl --get "${RELAYHUB_BASE_URL%/}' + request.path + '"',
    '  --data-urlencode "' + request.filter + '"',
    '  --header "Authorization: Bearer $RELAYHUB_API_KEY"',
  ].join(" \\\n");

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setCopyState("copied");
    } catch {
      const code = codeRef.current;
      if (!code) {
        return;
      }
      code.focus();
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(code);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setCopyState("manual");
    }
  }

  return (
    <div className={styles.command}>
      <div className={styles.toolbar}>
        <span>Bash · curl</span>
        <button type="button" onClick={copyCommand}>
          {t("Copy command", "Copia comando")}
        </button>
      </div>
      <pre>
        <code ref={codeRef} tabIndex={-1}>
          {command}
        </code>
      </pre>
      <div className={styles.feedback} role="status">
        {copyState === "copied" && t("Command copied.", "Comando copiato.")}
        {copyState === "manual" &&
          t(
            "Copy the command manually from the code above.",
            "Copia manualmente il comando dal riquadro qui sopra.",
          )}
      </div>
    </div>
  );
}

export function ApiExplorer() {
  const { t } = useLocale();
  const group = useId();
  const [selected, setSelected] = useState(0);
  const requests = readRequests(t);
  const request = requests[selected];

  return (
    <section
      className={styles.explorer}
      id="api-explorer"
      tabIndex={-1}
      aria-labelledby="api-explorer-title"
    >
      <div className={styles.intro}>
        <h2 id="api-explorer-title">
          {t("Explore the API", "Esplora le API")}
        </h2>
        <p>
          {t(
            "Choose what to look up, then copy the request and run it in your terminal against your own organization.",
            "Scegli cosa cercare, copia la richiesta ed eseguila nel tuo terminale per consultare i dati della tua organizzazione.",
          )}
        </p>
        <details className={styles.access}>
          <summary>
            {t(
              "Set up your read-only key",
              "Configura la chiave di sola lettura",
            )}
          </summary>
          <p>
            {t(
              "In your organization’s Settings, the owner can open API keys, issue a new key and copy it when it appears.",
              "Nelle Impostazioni dell’organizzazione, il proprietario può aprire Chiavi API, generare una nuova chiave e copiarla quando viene mostrata.",
            )}
          </p>
          <dl>
            <dt>
              <code>RELAYHUB_BASE_URL</code>
            </dt>
            <dd>
              {t(
                "Set this to the address of your RelayHub instance.",
                "Imposta l’indirizzo della tua istanza RelayHub.",
              )}
            </dd>
            <dt>
              <code>RELAYHUB_API_KEY</code>
            </dt>
            <dd>
              {t(
                "Set this to the read-only key in your local shell.",
                "Imposta la chiave di sola lettura nella tua shell locale.",
              )}
            </dd>
          </dl>
        </details>
        <a
          className={styles.reference}
          href="https://github.com/jacknegri89/RelayHub/blob/main/docs/api.yaml"
        >
          {t("OpenAPI reference", "Specifica OpenAPI")}{" "}
          <span aria-hidden="true">↗</span>
        </a>
      </div>
      <div className={styles.workbench}>
        <fieldset className={styles.picker}>
          <legend>{t("Choose a request", "Scegli una richiesta")}</legend>
          {requests.map((item, index) => (
            <label key={item.filter}>
              <input
                type="radio"
                name={group}
                checked={selected === index}
                onChange={() => setSelected(index)}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </fieldset>
        <p className={styles.result} aria-live="polite">
          {request.result}
        </p>
        <ReadCommand key={request.filter} request={request} />
      </div>
    </section>
  );
}
