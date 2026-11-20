"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  ["Overview", ""],
  ["Sources", "/sources"],
  ["Destinations", "/destinations"],
  ["Events", "/events"],
  ["Deliveries", "/deliveries"],
  ["Settings", "/settings"],
];

export function Navigation({ base }: { base: string }) {
  const pathname = usePathname();
  return (
    <nav className="navigation" aria-label="Organization">
      {sections.map(([label, segment]) => {
        const path = base + segment;
        const active =
          pathname === path ||
          Boolean(segment && pathname.startsWith(path + "/"));
        return (
          <Link
            key={label}
            href={path}
            aria-current={(active && "page") || undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
