import type { ReactNode } from "react";

export function SectionGuide({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="section-guide" aria-label={title}>
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}
