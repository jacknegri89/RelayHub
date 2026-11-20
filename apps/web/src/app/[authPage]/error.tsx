"use client";
import { LanguageSwitch, T } from "../../components/locale";

export default function AuthError({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="workspace-alone">
      <LanguageSwitch />
      <h1>
        <T en="Form unavailable" it="Modulo non disponibile" />
      </h1>
      <button onClick={reset}>
        <T en="Try again" it="Riprova" />
      </button>
    </main>
  );
}
