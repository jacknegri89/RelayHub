import Link from "next/link";
import { settings } from "@relayhub/shared/config";
import { PolicyPage } from "../../components/policy-page";
import { getLocale } from "../../server/locale";
import { publicPageMetadata } from "../../server/public-metadata";

export async function generateMetadata() {
  const { t } = await getLocale();
  return publicPageMetadata(
    "/privacy",
    t("Privacy Policy", "Informativa sulla privacy"),
    t(
      "How the hosted demo handles personal data and how to exercise your rights.",
      "Come la demo ospitata tratta i dati personali e come esercitare i tuoi diritti.",
    ),
  );
}

export default async function PrivacyPage() {
  const { t } = await getLocale();
  const config = settings();
  let mailProvider = "Resend";
  if (config.RELAYHUB_MAIL_PROVIDER === "gmail") {
    mailProvider = "Google (Gmail)";
  }
  if (config.RELAYHUB_MAILPIT_URL) {
    mailProvider = "Mailpit";
  }
  return (
    <PolicyPage
      title={t("Privacy Policy", "Informativa sulla privacy")}
      guideTitle={t("Find a privacy answer", "Consulta l’informativa")}
      sections={[
        ["operator", t("Controller and contact", "Titolare e contatti")],
        ["data", t("Data and purposes", "Dati e finalità")],
        [
          "recipients",
          t("Recipients and transfers", "Destinatari e trasferimenti"),
        ],
        ["retention", t("Retention", "Conservazione")],
        ["rights", t("Exercise your rights", "Esercita i tuoi diritti")],
      ]}
    >
      <p>
        {t(
          "Hosted portfolio demo · Updated 22 November 2026",
          "Demo portfolio ospitata · Aggiornata il 22 novembre 2026",
        )}
      </p>
      <h2 id="operator">
        {t(
          "Who is responsible for your data?",
          "Chi è il titolare del trattamento?",
        )}
      </h2>
      <p>
        {t(
          "Giacomo Negri is the controller for the hosted service at relayhub-webhooks.vercel.app. To ask a question or exercise a right, email him directly, including if you have no account or can no longer sign in.",
          "Giacomo Negri è il titolare del trattamento per il servizio ospitato su relayhub-webhooks.vercel.app. Puoi scrivergli direttamente anche senza un account o se hai perso l’accesso.",
        )}{" "}
        <a href="mailto:negrigiacomo435@gmail.com">negrigiacomo435@gmail.com</a>
        .
      </p>
      <h2 id="data">
        {t("What we use and why", "Quali dati usiamo e perché")}
      </h2>
      <ul>
        <li>
          <strong>
            {t("Account and workspace.", "Account e area di lavoro.")}
          </strong>{" "}
          {t(
            "To provide the service you request (Art. 6(1)(b) GDPR), we use your display name, email, password hash, memberships and roles. Registration requires a name, email and password. You can use a display name. Workspace members can see your name and avatar. An administrator may use your account email to add you. When enabled, account verification and recovery use time-limited email links.",
            "Per fornire il servizio richiesto (art. 6, par. 1, lett. b GDPR) trattiamo nome visualizzato, email, hash della password, appartenenza alle organizzazioni e ruoli. Per registrarti servono un nome, anche di fantasia, un’email e una password. I membri vedono il tuo nome e avatar. Un amministratore può aggiungerti usando l’email del tuo account. Verifica dell’email e recupero password, quando attivi, usano link a scadenza.",
          )}
        </li>
        <li>
          <strong>{t("Account security.", "Sicurezza dell’account.")}</strong>{" "}
          {t(
            "Session and browser identifiers, IP addresses where collected, request counters and audit records help protect accounts, limit abuse and diagnose failures. The legal basis is the controller’s legitimate interest in a secure service (Art. 6(1)(f)). Optional two-factor authentication uses an encrypted secret and encrypted recovery codes.",
            "Identificativi di sessione, informazioni sul browser, indirizzi IP ove raccolti, contatori di richieste e registri operativi servono a proteggere gli account, limitare gli abusi e diagnosticare guasti. La base è il legittimo interesse del titolare alla sicurezza del servizio (art. 6, par. 1, lett. f). L’autenticazione a due fattori facoltativa usa un segreto e codici di recupero cifrati.",
          )}
        </li>
        <li>
          <strong>{t("Test deliveries.", "Consegne di prova.")}</strong>{" "}
          {t(
            "The sender you connect supplies event IDs, types and bodies. RelayHub stores the encrypted body, routing details, times and outcomes to deliver and retry the event you requested. Use fictional payloads and authorized test destinations. GitHub push events can include author emails. If real personal data was sent by mistake, contact us privately with the event ID and approximate time.",
            "La sorgente che colleghi fornisce identificativi, tipi e contenuti degli eventi. Per effettuare la prova richiesta, RelayHub conserva il contenuto cifrato, le regole di instradamento, gli orari e gli esiti dei tentativi. Usa dati fittizi e destinazioni di prova autorizzate. Gli eventi push di GitHub possono includere le email degli autori. Se sono arrivati per errore dati personali reali, scrivici in privato indicando ID evento e orario approssimativo.",
          )}
        </li>
        <li>
          <strong>{t("Email alerts.", "Avvisi via email.")}</strong>{" "}
          {t(
            "When you enable alerts for a destination, your address and delivery preference are used to send the confirmation and the incident or recovery notices you requested (Art. 6(1)(b)). Turn them off on the destination page. Messages identify the destination, status and workspace link.",
            "Quando attivi gli avvisi per una destinazione, usiamo il tuo indirizzo e la preferenza per inviare la conferma e le notifiche di guasto e ripristino richieste (art. 6, par. 1, lett. b). Puoi disattivarli dalla pagina della destinazione. I messaggi indicano destinazione, stato e link all’area di lavoro.",
          )}
        </li>
        <li>
          <strong>{t("Privacy requests.", "Richieste privacy.")}</strong>{" "}
          {t(
            "We use your message and the minimum identifiers needed to locate your data, verify the request and respond as required by law (Art. 6(1)(c)). Please leave out passwords, codes, signing secrets and copies of webhook bodies.",
            "Usiamo il tuo messaggio e gli identificativi minimi necessari a individuare i dati, verificare la richiesta e rispondere agli obblighi di legge (art. 6, par. 1, lett. c). Evita di inviare password, codici, segreti di firma o copie dei webhook.",
          )}
        </li>
      </ul>
      <p>
        {t(
          "You can use the public simulator and the lost-response test without an account. The latter generates a fictional order and records real attempts and timings. RelayHub does not use this activity for profiling or automated decisions with legal or similarly significant effects.",
          "Puoi usare il simulatore pubblico e la prova di risposta persa senza un account. La prova genera un ordine fittizio e registra tentativi e tempi reali. RelayHub non usa questa attività per profilazione o decisioni automatizzate con effetti giuridici o analogamente significativi.",
        )}{" "}
        <Link href="/cookies">
          {t("Browser storage details", "Cosa conserva il browser")}
        </Link>
        .
      </p>
      <h2 id="recipients">
        {t("Who receives the data?", "Chi riceve i dati?")}
      </h2>
      <p>
        {t(
          "Vercel hosts the app and worker and handles network requests. Neon (Databricks) provides the PostgreSQL database. Upstash provides the Redis queue, which carries delivery identifiers. The selected destination receives the webhook body. Authorized members and tools with workspace API keys can consult the event metadata allowed by their permissions.",
          "Vercel ospita app e worker e gestisce le richieste di rete. Neon (Databricks) fornisce il database PostgreSQL. Upstash fornisce la coda Redis, che contiene identificativi di consegna. La destinazione scelta riceve il contenuto del webhook. I membri autorizzati e gli strumenti con chiavi API dell’organizzazione possono consultare i metadati consentiti dai loro permessi.",
        )}
      </p>
      <p>
        {t(
          `When service email is enabled, ${mailProvider} receives the recipient address and the message, including any temporary account link. Google also handles email sent to the controller’s privacy address. The application has no access to visitors’ mailboxes.`,
          `Quando la posta del servizio è attiva, ${mailProvider} riceve l’indirizzo del destinatario e il messaggio, compreso l’eventuale link temporaneo per l’account. Google gestisce anche le email inviate al recapito privacy del titolare. L’applicazione non accede alle caselle di posta dei visitatori.`,
        )}
      </p>
      {config.RELAYHUB_MAIL_PROVIDER === "gmail" && (
        <p>
          {t(
            "Only the operator authorizes Google’s send-only Gmail permission. RelayHub uses the server-held authorization to send the requested messages. The operator can revoke this permission in their Google account. RelayHub’s use of data obtained through this API is subject to Google’s Limited Use requirements.",
            "Soltanto il gestore autorizza il permesso Gmail di solo invio. RelayHub conserva l’autorizzazione sul server e la usa per inviare i messaggi richiesti. Il gestore può revocarla dal proprio account Google. All’uso dei dati ottenuti tramite questa API si applicano i requisiti di utilizzo limitato di Google.",
          )}{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy">
            Google API Services User Data Policy
          </a>
          .
        </p>
      )}
      <p>
        {t(
          "Providers and their subprocessors may process data outside the European Economic Area, including in the United States. Their published terms describe adequacy decisions or standard contractual clauses where applicable. You can ask the controller for details or a copy of the safeguards for a specific transfer.",
          "I fornitori e i loro subfornitori possono trattare dati fuori dallo Spazio economico europeo, anche negli Stati Uniti. Nei termini pubblicati descrivono le decisioni di adeguatezza o le clausole contrattuali tipo applicabili. Puoi chiedere al titolare informazioni o copia delle garanzie per uno specifico trasferimento.",
        )}{" "}
        <a href="https://vercel.com/legal/dpa">Vercel</a> ·{" "}
        <a href="https://neon.com/platform-terms">Neon</a> ·{" "}
        <a href="https://upstash.com/static/trust/dpa.pdf">Upstash</a> ·{" "}
        <a href="https://policies.google.com/privacy/frameworks">Google</a>.
      </p>
      <h2 id="retention">
        {t("How long data is kept", "Per quanto tempo conserviamo i dati")}
      </h2>
      <ul>
        <li>
          {t(
            "Account data remains while the account exists. Deletion removes active credentials, memberships, sessions and personal alert subscriptions. Shared workspaces and events already delivered to external receivers are managed separately.",
            "I dati dell’account restano per la sua durata. La cancellazione rimuove credenziali, appartenenze, sessioni e iscrizioni personali agli avvisi. Gli spazi condivisi e gli eventi già recapitati a destinatari esterni si gestiscono separatamente.",
          )}
        </li>
        <li>
          {t(
            `The worker removes events older than ${config.RETENTION_DAYS} days once all deliveries have ended, including the public test order. It also removes audit entries, completed email jobs and resolved incidents after ${config.RETENTION_DAYS} days. Pending work remains until it ends. Charts keep seven UTC dates.`,
            `Il worker elimina gli eventi più vecchi di ${config.RETENTION_DAYS} giorni quando tutte le consegne sono concluse, incluso l’ordine della prova pubblica. Elimina inoltre dopo ${config.RETENTION_DAYS} giorni le voci di audit, gli invii email conclusi e gli incidenti risolti. I lavori in corso restano fino alla conclusione. I grafici coprono sette date UTC.`,
          )}
        </li>
        <li>
          {t(
            `Login sessions expire within seven days of issue or renewal, account email links after ${config.RELAYHUB_ACCOUNT_LINK_MINUTES} minutes. Short-lived anti-abuse counters for a network address or email digest can outlast account closure. Scheduled cleanup removes expired counters, sessions and verification records.`,
            `Le sessioni scadono entro sette giorni dall’emissione o dal rinnovo, i link per l’account dopo ${config.RELAYHUB_ACCOUNT_LINK_MINUTES} minuti. I contatori antiabuso di breve durata associati a un indirizzo di rete o all’impronta di un’email possono sopravvivere alla chiusura dell’account. La pulizia periodica elimina contatori, sessioni e verifiche scaduti.`,
          )}
        </li>
        <li>
          {t(
            "Privacy correspondence is kept for as long as needed to handle the request and document the response or an ongoing dispute. Technical logs, mailbox copies and restricted backups follow separate retention cycles. Write to us for details about copies concerning you.",
            "La corrispondenza privacy viene conservata per il tempo necessario a gestire la richiesta e documentare la risposta o un’eventuale contestazione. Registri tecnici, copie nella posta e backup ad accesso limitato seguono cicli di conservazione separati. Puoi chiedere informazioni sulle copie che ti riguardano.",
          )}
        </li>
      </ul>
      <h2 id="rights">
        {t("Exercise your rights", "Come esercitare i tuoi diritti")}
      </h2>
      <p>
        <Link href="/workspace/profile">
          {t("Open your profile", "Apri il tuo profilo")}
        </Link>{" "}
        {t(
          "to edit your display name and avatar, download your account data in JSON or delete your account. For a shared workspace where you are the last owner, choose a successor. Review each workspace where you are the only member before confirming its deletion.",
          "per modificare nome e avatar, scaricare i dati dell’account in JSON o cancellare l’account. Se sei l’ultimo proprietario di uno spazio condiviso, scegli a chi trasferirlo. Verifica ogni organizzazione di cui sei l’unico membro prima di confermarne la cancellazione.",
        )}
      </p>
      <p>
        {t(
          "You can also write directly for access and a copy, correction (including your email), erasure, restriction or portability where applicable, or to object to processing based on legitimate interests. This includes requests about information outside the downloadable file or supplied by someone else. We generally respond free of charge within one month of receipt. Complex or numerous requests can take up to two additional months. We will tell you why within the first month.",
          "Puoi anche scrivere al titolare per accesso e copia, rettifica (anche dell’email), cancellazione, limitazione o portabilità ove applicabili, o per opporti ai trattamenti basati sul legittimo interesse. Puoi chiedere anche dati esclusi dal file scaricabile o comunicati da altri. Di norma rispondiamo gratuitamente entro un mese dal ricevimento. Per richieste complesse o numerose il termine può estendersi di altri due mesi. Te ne comunicheremo il motivo entro il primo mese.",
        )}
      </p>
      <p>
        {t(
          "You can lodge a complaint with the authority where you live, work or believe an infringement occurred. In Italy, contact the",
          "Puoi presentare reclamo all’autorità del luogo in cui risiedi, lavori o ritieni sia avvenuta la violazione. In Italia puoi rivolgerti al",
        )}{" "}
        <a href="https://www.garanteprivacy.it/i-miei-diritti">
          Garante per la protezione dei dati personali
        </a>
        .
      </p>
    </PolicyPage>
  );
}
