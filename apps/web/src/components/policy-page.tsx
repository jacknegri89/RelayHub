import Link from "next/link";
import { Brand } from "./brand";
import { PolicyLinks } from "./policy-links";
import type { ReactNode } from "react";

export function PolicyPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main id="main" className="policy-page">
      <header>
        <Link href="/" aria-label="RelayHub home">
          <Brand />
        </Link>
        <PolicyLinks />
      </header>
      <article>
        <h1>{title}</h1>
        {children}
      </article>
    </main>
  );
}
