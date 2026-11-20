"use client";
import { useLocale } from "../../components/locale";
import { LostSignal } from "../../components/void-page";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  const { t } = useLocale();
  return (
    <section className="workspace-alone void-body" role="alert">
      <LostSignal />
      <p className="coordinates">
        {t("Signal interrupted", "Segnale interrotto")}
      </p>
      <h2>{t("Workspace unavailable", "Area di lavoro non disponibile")}</h2>
      <p>
        {t(
          "The workspace could not load. Your events and deliveries are safe; try loading it again.",
          "Non è stato possibile caricare l’area di lavoro. I tuoi eventi e le consegne sono al sicuro: prova a ricaricarla.",
        )}
      </p>
      <button type="button" onClick={reset}>
        {t("Try again", "Riprova")}
      </button>
    </section>
  );
}
