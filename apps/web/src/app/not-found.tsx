import { LanguageSwitch, T } from "../components/locale";
import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="workspace-alone">
      <LanguageSwitch />
      <h1>
        <T en="Page unavailable" it="Pagina non disponibile" />
      </h1>
      <p>
        <T
          en="Check the address or return to your organizations."
          it="Controlla l’indirizzo o torna alle tue organizzazioni."
        />
      </p>
      <Link href="/workspace">
        <T en="Open organizations" it="Apri le organizzazioni" />
      </Link>
    </main>
  );
}
