import { getLocale } from "../../server/locale";
import { PolicyPage } from "../../components/policy-page";

export async function generateMetadata() {
  const { t } = await getLocale();
  return {
    title: t("Privacy Policy", "Informativa sulla privacy"),
    description: t(
      "How RelayHub handles account, security and webhook data.",
      "Come RelayHub tratta i dati di account, sicurezza e webhook.",
    ),
  };
}

export default async function PrivacyPage() {
  const { t } = await getLocale();
  return (
    <PolicyPage
      title={t("Privacy Policy", "Informativa sulla privacy")}
      guideTitle={t("Find a privacy answer", "Consulta l’informativa")}
      guide={
        <>
          {t("See ", "Consulta ")}
          <a href="#data">
            {t("which data RelayHub handles", "quali dati tratta RelayHub")}
          </a>
          {t(" and ", " e ")}
          <a href="#retention">
            {t("how long it keeps them", "per quanto tempo li conserva")}
          </a>
          .{" "}
          {t(
            "For a privacy request, ",
            "Per una richiesta relativa alla privacy, ",
          )}
          <a href="#operator">
            {t("contact the operator", "contatta il gestore")}
          </a>
          .
        </>
      }
    >
      <p>
        {t(
          "This notice applies to the hosted RelayHub service at relayhub-webhooks.vercel.app.",
          "Questa informativa riguarda il servizio RelayHub disponibile su relayhub-webhooks.vercel.app.",
        )}
      </p>
      <h2 id="operator">
        {t("Who operates RelayHub", "Chi gestisce RelayHub")}
      </h2>
      <p>
        {t(
          "Giacomo Negri operates the hosted service. For questions or privacy requests, use the contact details on the",
          "Giacomo Negri gestisce il servizio. Per domande o richieste relative alla privacy, usa i recapiti indicati nel",
        )}{" "}
        <a href="https://github.com/jacknegri89">
          {t("operator’s GitHub profile", "profilo GitHub del gestore")}
        </a>
        .{" "}
        {t(
          "Keep account details and webhook payloads out of public issues.",
          "Evita di pubblicare dati dell’account o contenuti dei webhook nelle segnalazioni pubbliche.",
        )}
      </p>
      <h2 id="data">{t("Data and purposes", "Dati trattati e finalità")}</h2>
      <ul>
        <li>
          <strong>{t("Account data.", "Dati dell’account.")}</strong>{" "}
          {t(
            "Name, email, and password hash support registration and sign-in. If you enable two-factor authentication, the service stores encrypted authenticator data and recovery codes.",
            "Usiamo nome, email e hash della password per la registrazione e l’accesso. Se attivi l’autenticazione a due fattori, il servizio conserva in forma cifrata i dati dell’app di autenticazione e i codici di recupero.",
          )}
        </li>
        <li>
          <strong>
            {t(
              "Workspace and delivery data.",
              "Dati dell’area di lavoro e delle consegne.",
            )}
          </strong>{" "}
          {t(
            "Membership, routing configuration, encrypted webhook payloads and signing keys, and delivery metadata support routing, retries, and delivery history. Authorized workspace members can see operational metadata.",
            "Per instradare gli eventi, riprovare le consegne e mantenerne la cronologia, usiamo i dati dei membri, le regole di instradamento, il contenuto dei webhook e le chiavi di firma cifrati, oltre ai metadati di consegna. I membri autorizzati possono consultare i metadati operativi.",
          )}
        </li>
        <li>
          <strong>
            {t("Security and operations.", "Sicurezza e funzionamento.")}
          </strong>{" "}
          {t(
            "Session identifiers, request counters, and log metadata help prevent abuse and diagnose service problems.",
            "Gli identificativi di sessione, i contatori delle richieste e i metadati dei registri aiutano a prevenire abusi e individuare problemi tecnici.",
          )}
        </li>
      </ul>
      <p>
        {t(
          "RelayHub processes account and routing data to provide the service you request. Security and diagnostic processing supports the operator’s legitimate interest in keeping the service reliable and protecting accounts.",
          "RelayHub tratta i dati dell’account e di instradamento per fornire il servizio richiesto. I trattamenti di sicurezza e diagnostica rispondono al legittimo interesse del gestore a mantenere il servizio affidabile e a proteggere gli account.",
        )}
      </p>
      <h2>{t("Who receives data", "Chi riceve i dati")}</h2>
      <p>
        {t(
          "Vercel hosts the web and worker services. Neon provides PostgreSQL and Upstash provides the Redis queue. These services support RelayHub’s operation. Delivery sends webhook contents to the destinations configured by workspace operators. Select destinations you are authorized to use.",
          "Vercel ospita l’applicazione e il servizio di consegna. Neon fornisce il database PostgreSQL e Upstash la coda Redis. RelayHub invia il contenuto dei webhook alle destinazioni configurate dai gestori dell’area di lavoro. Scegli destinazioni che hai il permesso di utilizzare.",
        )}
      </p>
      <h2 id="retention">{t("Retention", "Tempi di conservazione")}</h2>
      <p>
        {t(
          "Account and configuration records are kept while needed to operate the account or workspace. Terminal delivery records and audit history are removed after the configured retention period. Pending deliveries remain available for retry. Backup and provider log retention may differ from the live service.",
          "I dati dell’account e della configurazione vengono conservati per il tempo necessario al funzionamento dell’account o dell’area di lavoro. Le consegne concluse e la cronologia di audit vengono eliminate al termine del periodo di conservazione configurato. Le consegne in attesa restano disponibili per ulteriori tentativi. I fornitori possono applicare tempi diversi ai propri backup e registri.",
        )}
      </p>
      <p>
        {t(
          "Destination charts cover seven UTC dates. An open outage stays in the workspace until recovery. The retention period for its alert history starts at recovery.",
          "I grafici di ogni destinazione coprono sette giorni UTC. Un guasto aperto resta visibile fino al ripristino. Da quel momento decorre il periodo di conservazione dei relativi avvisi.",
        )}
      </p>
      <h2>{t("Your choices and rights", "Scelte e diritti")}</h2>
      <p>
        {t(
          "You can sign out and manage two-factor authentication from your workspace. Where applicable, you can request access, correction, deletion, restriction, or portability, object to certain processing, and lodge a complaint with your data-protection authority.",
          "Dall’area di lavoro puoi uscire dall’account e gestire l’autenticazione a due fattori. Quando previsto, puoi chiedere accesso, rettifica, cancellazione, limitazione o portabilità dei dati, opporti a determinati trattamenti e presentare reclamo all’autorità di controllo competente.",
        )}
      </p>
    </PolicyPage>
  );
}
