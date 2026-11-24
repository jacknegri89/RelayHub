import { T } from "../components/locale";
import Link from "next/link";
import { VoidPage } from "../components/void-page";
import { getLocale } from "../server/locale";

export async function generateMetadata() {
  const { t } = await getLocale();
  return { title: t("Page unavailable", "Pagina non disponibile") };
}

export default function NotFound() {
  return (
    <VoidPage
      errorCode={404}
      title={<T en="Page unavailable" it="Pagina non disponibile" />}
      actions={
        <>
          <Link href="/">
            <T en="Back to the homepage" it="Torna alla pagina iniziale" />
          </Link>
          <Link href="/workspace">
            <T en="Open organizations" it="Apri le organizzazioni" />
          </Link>
        </>
      }
    >
      <p>
        <T
          en="This address does not lead to a page, or the resource belongs to an organization you cannot access. Check the address or return to your organizations."
          it="Questo indirizzo non porta a una pagina, oppure la risorsa appartiene a un’organizzazione a cui non hai accesso. Controlla l’indirizzo o torna alle tue organizzazioni."
        />
      </p>
    </VoidPage>
  );
}
