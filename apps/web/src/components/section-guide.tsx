import type { ReactNode } from "react";
import { InterfaceIcon } from "./interface-icon";

export function SectionGuide({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="section-guide" aria-label={title}>
      <InterfaceIcon name="guide" />
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}
