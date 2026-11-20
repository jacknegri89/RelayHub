"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AlertSummary } from "../server/destination-monitoring";
import { useLocale } from "./locale";
import styles from "./destination-alerts.module.css";

const POLL_INTERVAL_MS = 30_000;

function revision(summary: AlertSummary) {
  const latest = summary.latest;
  return JSON.stringify([
    summary.openCount,
    latest?.id,
    latest?.kind,
    latest?.at,
    latest?.name,
  ]);
}

export function AlertLink({
  organizationId,
  summary,
  active,
}: {
  organizationId: string;
  summary: AlertSummary;
  active: boolean;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [stale, setStale] = useState(false);
  const version = revision(summary);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function check() {
      if (document.hidden || pending) {
        return;
      }
      pending = true;
      try {
        const result = await fetch(
          "/api/organizations/" + organizationId + "/destination-alerts",
          { cache: "no-store", signal: controller.signal },
        );
        if (
          result.status === 401 ||
          result.status === 403 ||
          result.status === 404
        ) {
          router.refresh();
          return;
        }
        if (!result.ok) {
          setStale(true);
          return;
        }
        const next: AlertSummary = await result.json();
        if (!controller.signal.aborted) {
          setStale(false);
          if (revision(next) !== version) {
            router.refresh();
          }
        }
      } catch {
        if (!controller.signal.aborted) {
          setStale(true);
        }
      } finally {
        pending = false;
      }
    }
    const timer = window.setInterval(check, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [organizationId, router, version]);

  const latest = summary.latest;
  let transition = t("Outage", "Guasto");
  if (latest?.kind === "recovery") {
    transition = t("Recovered", "Ripristino");
  }
  return (
    <Link
      href={"/workspace/" + organizationId + "/alerts"}
      aria-current={(active && "page") || undefined}
    >
      {t("Alerts", "Avvisi")}
      <span aria-live="polite" aria-atomic="true">
        {summary.openCount > 0 && (
          <span className={styles.count}>
            {summary.openCount} {t("open", "aperti")}
          </span>
        )}
        {latest && (
          <small className={styles.latest}>
            {transition} · {latest.name}
          </small>
        )}
        {stale && (
          <small className={styles.latest}>
            {t("Update unavailable", "Aggiornamento non disponibile")}
          </small>
        )}
      </span>
    </Link>
  );
}
