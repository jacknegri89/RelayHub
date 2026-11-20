import { getLocale } from "../server/locale";
import Link from "next/link";

export async function PolicyLinks() {
  const { t } = await getLocale();
  return (
    <nav className="policy-links" aria-label={t("Policies", "Informative")}>
      <Link href="/privacy">
        {t("Privacy Policy", "Informativa sulla privacy")}
      </Link>
      <Link href="/cookies">
        {t("Cookie Policy", "Informativa sui cookie")}
      </Link>
    </nav>
  );
}
