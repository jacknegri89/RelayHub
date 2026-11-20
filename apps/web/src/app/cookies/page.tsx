import { getLocale } from "../../server/locale";
import Link from "next/link";
import { PolicyPage } from "../../components/policy-page";

export async function generateMetadata() {
  const { t } = await getLocale();
  return {
    title: t("Cookie Policy", "Informativa sui cookie"),
    description: t(
      "How RelayHub uses cookies for sessions, account security and your language preference.",
      "I cookie di RelayHub per l’accesso, la sicurezza e la scelta della lingua.",
    ),
  };
}

export default async function CookiePage() {
  const { t } = await getLocale();
  return (
    <PolicyPage title={t("Cookie Policy", "Informativa sui cookie")}>
      <p>
        {t(
          "RelayHub uses essential first-party cookies for sign-in and account security.",
          "RelayHub usa cookie propri essenziali per l’accesso e la sicurezza dell’account.",
        )}
      </p>
      <dl className="cookie-list">
        <div>
          <dt>{t("Session token", "Token di sessione")}</dt>
          <dd>
            {t(
              "Keeps you signed in so you can use your workspace. In the hosted app the session expires after up to seven days from issue or refresh. Signing out clears the session.",
              "Mantiene attivo l’accesso all’area di lavoro. La sessione scade entro sette giorni dall’emissione o dal rinnovo. Quando esci dall’account, la sessione viene cancellata.",
            )}
          </dd>
        </div>
        <div>
          <dt>{t("Two-factor challenge", "Verifica a due fattori")}</dt>
          <dd>
            {t(
              "Connects a successful password check to the authenticator or recovery-code step. It expires after five minutes.",
              "Collega la verifica della password al passaggio successivo con l’app di autenticazione o un codice di recupero. Scade dopo cinque minuti.",
            )}
          </dd>
        </div>
        <div>
          <dt>
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
          <dt>{t("Language preference", "Preferenza di lingua")}</dt>
          <dd>
            {t(
              "When you choose a language, relayhub_lang remembers English or Italian for one year on this browser.",
              "Quando scegli una lingua, relayhub_lang memorizza la scelta tra italiano e inglese per un anno su questo browser.",
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
