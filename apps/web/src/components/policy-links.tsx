import Link from "next/link";

export function PolicyLinks() {
  return (
    <nav className="policy-links" aria-label="Policies">
      <Link href="/privacy">Privacy Policy</Link>
      <Link href="/cookies">Cookie Policy</Link>
    </nav>
  );
}
