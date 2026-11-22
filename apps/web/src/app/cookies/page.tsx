import { getLocale } from "../../server/locale";
import Link from "next/link";
import { PolicyPage } from "../../components/policy-page";
import { publicPageMetadata } from "../../server/public-metadata";

export async function generateMetadata() {
  const { t } = await getLocale();
  return publicPageMetadata(
    "/cookies",
    t("Cookie Policy", "Informativa sui cookie"),
    t(
      "How RelayHub uses cookies for sessions, account security and your language preference.",
      "I cookie di RelayHub per l’accesso, la sicurezza e la scelta della lingua.",
    ),
  );
}

export default async function CookiePage() {
  const { t } = await getLocale();
  return (
    <PolicyPage
      title={t("Cookie Policy", "Informativa sui cookie")}
      guideTitle={t(
        "Check what your browser stores",
        "Controlla cosa conserva il browser",
      )}
      sections={[
        ["session", t("Sign-in session", "Sessione di accesso")],
        ["two-factor", t("Two-factor challenge", "Verifica a due fattori")],
        ["persistence", t("Session persistence", "Durata della sessione")],
        ["language", t("Language preference", "Preferenza di lingua")],
        ["test", t("Public test in this tab", "Prova pubblica nella scheda")],
      ]}
    >
      <p>
        {t(
          "Updated 22 November 2026. The hosted demo uses first-party technical cookies for sign-in, account security and the language you select. The public test also uses temporary storage in your tab.",
          "Aggiornata il 22 novembre 2026. La demo ospitata usa cookie tecnici propri per accesso, sicurezza e lingua scelta. La prova pubblica usa anche la memoria temporanea della scheda.",
        )}
      </p>
      <dl className="cookie-list">
        <div>
          <dt id="session">{t("Session token", "Token di sessione")}</dt>
          <dd>
            {t(
              "Keeps you signed in so you can use your workspace. In the hosted app the session expires after up to seven days from issue or refresh. Signing out clears the session.",
              "Mantiene attivo l’accesso all’area di lavoro. La sessione scade entro sette giorni dall’emissione o dal rinnovo. Quando esci dall’account, la sessione viene cancellata.",
            )}
          </dd>
        </div>
        <div>
          <dt id="two-factor">
            {t("Two-factor challenge", "Verifica a due fattori")}
          </dt>
          <dd>
            {t(
              "Connects a successful password check to the authenticator or recovery-code step. It expires after five minutes.",
              "Collega la verifica della password al passaggio successivo con l’app di autenticazione o un codice di recupero. Scade dopo cinque minuti.",
            )}
          </dd>
        </div>
        <div>
          <dt id="persistence">
            {t(
              "Session persistence preference",
              "Preferenza di durata della sessione",
            )}
          </dt>
          <dd>
            {t(
              "When present, helps the sign-in service honor a request to keep the session in the current browser only.",
              "Quando presente, consente di mantenere la sessione nel solo browser in uso.",
            )}
          </dd>
        </div>
        <div>
          <dt id="language">
            {t("Language preference", "Preferenza di lingua")}
          </dt>
          <dd>
            {t(
              "When you choose a language, relayhub_lang remembers English or Italian for one year on this browser.",
              "Quando scegli una lingua, relayhub_lang memorizza la scelta tra italiano e inglese per un anno su questo browser.",
            )}
          </dd>
        </div>
        <div>
          <dt id="test">
            {t("Lost-response test", "Prova di risposta persa")}
          </dt>
          <dd>
            {t(
              "Starting the test stores its identifier and private read key under relayhub.lost-response.v1 in sessionStorage. This lets you reload or open the result dashboard from the same tab without creating an account. Starting another test replaces the entry. Closing the tab normally ends this storage session. Clearing the site’s data also removes it.",
              "Avviando la prova, il browser salva l’identificativo e la chiave privata di lettura nella voce relayhub.lost-response.v1 di sessionStorage. Così puoi ricaricare o aprire il risultato nella dashboard dalla stessa scheda senza registrarti. Una nuova prova sostituisce la voce. La chiusura della scheda normalmente termina questa sessione. Anche la cancellazione dei dati del sito la rimuove.",
            )}
          </dd>
        </div>
      </dl>
      <p>
        {t(
          "RelayHub does not use cookies for analytics or advertising. You can clear cookies in your browser settings. Blocking essential cookies prevents sign-in.",
          "RelayHub non usa cookie per analisi statistiche o pubblicità. Puoi cancellare i cookie nelle impostazioni del browser. Se blocchi quelli essenziali, non potrai accedere.",
        )}
      </p>
      <p>
        {t(
          "For details about other account and service data, read the ",
          "Per informazioni sugli altri dati dell’account e del servizio, leggi l’",
        )}
        <Link href="/privacy">
          {t("Privacy Policy", "informativa sulla privacy")}
        </Link>
        .
      </p>
    </PolicyPage>
  );
}
