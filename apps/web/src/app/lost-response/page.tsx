import { headers } from "next/headers";
import { PublicFooter, PublicHeader } from "../../components/public-navigation";
import { LostResponseTest } from "../../components/lost-response-test";
import { auth } from "../../server/auth";
import { getLocale } from "../../server/locale";
import { issueFormProof, MIN_FORM_TIME_MS } from "../../server/form-proof";
import landing from "../landing.module.css";

export async function generateMetadata() {
  const { t } = await getLocale();
  return {
    title: t("Try a lost response", "Prova una risposta persa"),
    description: t(
      "Compare the delivery attempts for one webhook with the orders actually saved by its receiver.",
      "Confronta i tentativi di consegna di un webhook con gli ordini effettivamente salvati dal destinatario.",
    ),
  };
}

export default async function LostResponsePage() {
  const session = await auth().api.getSession({ headers: await headers() });
  return (
    <div className={landing.landing}>
      <PublicHeader signedIn={Boolean(session)} />
      <LostResponseTest
        formProof={issueFormProof("lost-response")}
        minFormTimeMs={MIN_FORM_TIME_MS}
      />
      <PublicFooter />
    </div>
  );
}
