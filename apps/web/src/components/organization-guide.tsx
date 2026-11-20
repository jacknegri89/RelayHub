import { can, type Permission, type Role } from "@relayhub/shared/access";
import { useLocale } from "./locale";
import { SectionGuide } from "./section-guide";

type Translation = [english: string, italian: string];
type Guide = {
  title: Translation;
  instructions: Translation;
  action?: { permission: Permission; instructions: Translation };
};

const guides: Partial<Record<string, Guide>> = {
  overview: {
    title: ["Read the last 24 hours", "Leggi le ultime 24 ore"],
    instructions: [
      "Compare received events with completed deliveries. Open a recent event to see which destinations it reached.",
      "Confronta gli eventi ricevuti con le consegne concluse. Apri un evento recente per vedere quali destinazioni ha raggiunto.",
    ],
    action: {
      permission: "configure",
      instructions: [
        "New organization? Start in Sources, then link a destination. When events arrive, open one here to check where it went.",
        "Se l’organizzazione è nuova, inizia da Sorgenti e collega una destinazione. Quando arrivano i primi eventi, aprine uno qui per vedere dove è stato inoltrato.",
      ],
    },
  },
  sources: {
    title: ["Identify the sender", "Individua il mittente"],
    instructions: [
      "Find the sending app by name. Check its endpoint, whether it is enabled, and how many events it has on record.",
      "Cerca l’app mittente per nome. Controlla il suo indirizzo, lo stato e il numero di eventi conservati.",
    ],
    action: {
      permission: "configure",
      instructions: [
        "Name the sending app and create its source. Save the signing secret when it appears, then configure the sender with the secret and the source URL.",
        "Dai un nome all’app mittente e crea la sorgente. Quando compare la chiave di firma, salvala e configura il mittente con la chiave e l’URL della sorgente.",
      ],
    },
  },
  destinations: {
    title: ["Follow a route", "Segui una regola di inoltro"],
    instructions: [
      "Find the receiving app to check its routes. Open its history to see seven days of attempts, response times and alerts.",
      "Trova il destinatario per controllare le sue regole. Apri lo storico per vedere sette giorni di tentativi, tempi di risposta e avvisi.",
    ],
    action: {
      permission: "configure",
      instructions: [
        "Enter the receiver’s URL and link a source. Leave the event type blank to accept every type from that source, then send a test delivery.",
        "Inserisci l’URL del destinatario e collega una sorgente. Lascia vuoto il tipo di evento per inoltrare tutti quelli di quella sorgente, poi invia una consegna di prova.",
      ],
    },
  },
  events: {
    title: ["Find an incoming event", "Trova un evento ricevuto"],
    instructions: [
      "Filter by source, then search for the event type or the ID assigned by the sender. Open a result to follow its deliveries.",
      "Filtra per sorgente e cerca il tipo di evento o l’ID assegnato dal mittente. Apri un risultato per seguirne le consegne.",
    ],
  },
  destination: {
    title: ["Read destination history", "Leggi lo storico della destinazione"],
    instructions: [
      "Select a day to compare successful and failed attempts. A retry counts as another attempt. The latency chart measures only requests that received an HTTP response.",
      "Seleziona un giorno per confrontare tentativi riusciti e falliti. Ogni nuovo invio conta come tentativo. Il grafico dei tempi considera le richieste che hanno ricevuto una risposta HTTP.",
    ],
  },
  alerts: {
    title: ["Investigate an outage", "Verifica un guasto"],
    instructions: [
      "Open a destination to check its history. An outage stays open until a delivery succeeds. Filter to open outages to see which destinations still need attention.",
      "Apri una destinazione per consultare lo storico. Il guasto resta aperto finché una consegna riesce. Filtra i guasti aperti per vedere quali destinazioni richiedono ancora attenzione.",
    ],
  },
  event: {
    title: ["Follow this event", "Segui questo evento"],
    instructions: [
      "Match the external ID with the sender’s records. Open a delivery to see the attempts for that destination. An unrouted event matched no destination.",
      "Confronta l’ID esterno con quello registrato dal mittente. Apri una consegna per vedere i tentativi verso quel destinatario. Un evento senza destinazione non ha trovato regole corrispondenti.",
    ],
  },
  deliveries: {
    title: ["Find a delivery", "Trova una consegna"],
    instructions: [
      "Search by destination name or external event ID. Choose a status to narrow the results, then open a delivery to read its history.",
      "Cerca per nome del destinatario o ID esterno dell’evento. Scegli uno stato per restringere i risultati e apri una consegna per leggerne la cronologia.",
    ],
  },
  delivery: {
    title: ["Read the attempts", "Leggi i tentativi"],
    instructions: [
      "Read the attempts in order and check the receiver’s response. The linked event shows other destinations for the same message.",
      "Leggi i tentativi in ordine e controlla la risposta del destinatario. L’evento collegato mostra le altre destinazioni dello stesso messaggio.",
    ],
    action: {
      permission: "configure",
      instructions: [
        "Read the attempts in order and check the receiver’s response. If delivery failed, fix the cause before starting a new attempt.",
        "Leggi i tentativi in ordine e controlla la risposta del destinatario. Se la consegna è fallita, correggi la causa prima di avviare un nuovo tentativo.",
      ],
    },
  },
  settings: {
    title: ["Check team access", "Controlla gli accessi"],
    instructions: [
      "Check who belongs to this organization and their roles. Contact its owner if someone needs access.",
      "Controlla chi fa parte dell’organizzazione e con quale ruolo. Per aggiungere qualcuno, rivolgiti al proprietario.",
    ],
    action: {
      permission: "manage_members",
      instructions: [
        "Ask the person for the account ID on their Organizations page. Add them as a viewer to inspect activity or as an admin to manage routes and retries.",
        "Chiedi alla persona l’ID account che trova in Organizzazioni. Assegna il ruolo di lettore per consultare l’attività o di amministratore per gestire regole e riconsegne.",
      ],
    },
  },
};

// The organization layout persists when moving between a list and its records.
function getGuide(path: string): Guide | undefined {
  const [section = "overview", recordId] = path.split("/").filter(Boolean);
  if (recordId && section === "events") {
    return guides.event;
  }
  if (recordId && section === "destinations") {
    return guides.destination;
  }
  if (recordId && section === "deliveries") {
    return guides.delivery;
  }
  if (Object.hasOwn(guides, section)) {
    return guides[section];
  }
}

export function OrganizationGuide({
  path,
  role,
}: {
  path: string;
  role: Role;
}) {
  const { t } = useLocale();
  const guide = getGuide(path);
  if (!guide) {
    return null;
  }
  let instructions = guide.instructions;
  if (guide.action && can(role, guide.action.permission)) {
    instructions = guide.action.instructions;
  }

  return (
    <SectionGuide title={t(...guide.title)}>{t(...instructions)}</SectionGuide>
  );
}
