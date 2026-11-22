import { LostResponseTest } from "../../components/lost-response-test";
import { getLocale } from "../../server/locale";
import { issueFormProof, MIN_FORM_TIME_MS } from "../../server/form-proof";

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

export default function LostResponsePage() {
  return (
    <LostResponseTest
      formProof={issueFormProof("lost-response")}
      minFormTimeMs={MIN_FORM_TIME_MS}
    />
  );
}
