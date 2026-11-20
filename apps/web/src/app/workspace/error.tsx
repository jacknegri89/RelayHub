"use client";
import { useLocale } from "../../components/locale";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  const { t } = useLocale();
  return (
    <section className="workspace-alone">
      <h2>{t("Workspace unavailable", "Area di lavoro non disponibile")}</h2>
      <p>
        {t(
          "Try loading the workspace again.",
          "Prova a ricaricare l’area di lavoro.",
        )}
      </p>
      <button onClick={reset}>{t("Try again", "Riprova")}</button>
    </section>
  );
}
