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
    title: ["Check delivery health", "Controlla le consegne"],
    instructions: [
      "Compare the success rate with the previous day. Filter the weekly chart to see failed attempts, then open a recent event to follow its deliveries.",
      "Confronta il tasso di successo con le 24 ore precedenti. Filtra il grafico settimanale per vedere i tentativi falliti e apri un evento recente per seguirne le consegne.",
    ],
    action: {
      permission: "configure",
      instructions: [
        "Start with a source and a destination. Once events arrive, compare the last two days and filter the weekly chart to find failed attempts.",
        "Inizia con una sorgente e una destinazione. Quando arrivano gli eventi, confronta le ultime due finestre di 24 ore e filtra il grafico settimanale per trovare i tentativi falliti.",
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
        "Choose GitHub for a repository webhook or RelayHub for a sender using RelayHub signatures. Save the signing secret when it appears and use it with the source URL.",
        "Scegli GitHub per il webhook di un repository o RelayHub se il mittente usa le firme RelayHub. Salva la chiave di firma quando compare e usala insieme all’URL della sorgente.",
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
      "Select a day to compare attempts and inspect failures. You can also subscribe to outage and recovery emails for this destination.",
      "Seleziona un giorno per confrontare i tentativi e aprire il dettaglio degli errori. Puoi anche attivare gli avvisi email di guasto e ripristino per questa destinazione.",
    ],
  },
  attempts: {
    title: ["Read the failed attempts", "Esamina i tentativi falliti"],
    instructions: [
      "Check the response for each attempt on the selected UTC day. Open a delivery to see whether a later attempt succeeded.",
      "Controlla l’esito di ogni tentativo nel giorno UTC selezionato. Apri una consegna per vedere se uno dei tentativi successivi è riuscito.",
    ],
  },
  recovery: {
    title: ["Review this recovery", "Verifica le consegne dopo il ripristino"],
    instructions: [
      "Open a delivery to inspect its attempts. This list covers deliveries from the selected outage that are still failed.",
      "Apri una consegna per esaminare i tentativi. Qui trovi quelle coinvolte nel guasto selezionato che risultano ancora fallite.",
    ],
    action: {
      permission: "configure",
      instructions: [
        "Check which deliveries are still failed, then select those to retry. Open a delivery to follow its next attempt.",
        "Controlla le consegne ancora fallite e seleziona quelle da reinviare. Apri una consegna per seguire il nuovo tentativo.",
      ],
    },
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
        "Use an account ID to add a team member. For an external reporting tool, create a read-only API key and revoke it here when access ends.",
        "Usa l’ID account per aggiungere un membro. Per collegare uno strumento di reportistica, crea una chiave API di sola lettura e revocala qui quando termina l’accesso.",
      ],
    },
  },
};

// The organization layout persists when moving between a list and its records.
function getGuide(path: string): Guide | undefined {
  const [section = "overview", recordId, view] = path
    .split("/")
    .filter(Boolean);
  if (recordId && section === "events") {
    return guides.event;
  }
  if (recordId && section === "destinations") {
    if (view === "attempts") {
      return guides.attempts;
    }
    if (view === "recovery") {
      return guides.recovery;
    }
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
