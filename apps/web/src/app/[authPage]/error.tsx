"use client";
import Link from "next/link";
import { T } from "../../components/locale";
import { VoidPage } from "../../components/void-page";

export default function AuthError({ reset }: { reset: () => void }) {
  return (
    <VoidPage
      title={<T en="Form unavailable" it="Modulo non disponibile" />}
      actions={
        <>
          <button type="button" onClick={reset}>
            <T en="Try again" it="Riprova" />
          </button>
          <Link href="/">
            <T en="Back to the homepage" it="Torna alla pagina iniziale" />
          </Link>
        </>
      }
    >
      <p>
        <T
          en="The form could not load. Nothing you typed was sent. Try again in a moment."
          it="Non è stato possibile caricare il modulo. Nulla di ciò che hai scritto è stato inviato. Riprova tra un momento."
        />
      </p>
    </VoidPage>
  );
}
