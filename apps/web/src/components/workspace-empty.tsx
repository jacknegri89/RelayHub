import Link from "next/link";
import styles from "./workspace-records.module.css";

type SignalKind = "source" | "destination" | "events" | "alerts" | "filter";

function RouteSignal({ kind }: { kind: SignalKind }) {
  return (
    <span className={styles.signal} data-kind={kind} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

export function WorkspaceEmpty({
  kind,
  title,
  description,
  link,
}: {
  kind: SignalKind;
  title: string;
  description: string;
  link?: { href: string; label: string };
}) {
  return (
    <div className={styles.empty}>
      <RouteSignal kind={kind} />
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
        {link && (
          <Link href={link.href}>
            {link.label}
            <span aria-hidden="true"> →</span>
          </Link>
        )}
      </div>
    </div>
  );
}
