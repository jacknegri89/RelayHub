import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "./brand";
import { LanguageSwitch } from "./locale";

// A signal that left the relay and found no lane: used by 404 and error pages.
export function LostSignal() {
  return (
    <svg className="void-figure" viewBox="0 0 300 120" aria-hidden="true">
      <line className="lane" x1="0" y1="20" x2="300" y2="20" />
      <line className="lane" x1="0" y1="100" x2="190" y2="100" />
      <path className="lost" d="M30 20 L110 100 L140 70 L170 100 L215 55" />
      <circle className="lost-head" cx="215" cy="55" r="4" />
    </svg>
  );
}

export function VoidPage({
  coordinates,
  title,
  children,
  actions,
}: {
  coordinates: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="void-page">
      <header>
        <Link href="/" aria-label="RelayHub">
          <Brand />
        </Link>
        <LanguageSwitch />
      </header>
      <main id="main" className="void-body">
        <LostSignal />
        <p className="coordinates">{coordinates}</p>
        <h1>{title}</h1>
        {children}
        {actions && <div className="void-actions">{actions}</div>}
      </main>
    </div>
  );
}
