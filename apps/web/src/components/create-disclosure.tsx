"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./workspace-records.module.css";

export function CreateDisclosure({
  id,
  firstUse,
  label,
  children,
}: {
  id: string;
  firstUse: boolean;
  label: string;
  children: ReactNode;
}) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  // Keep the form open across the first creation so its one-time secret remains visible.
  const [initiallyOpen] = useState(firstUse);
  useEffect(() => {
    function openForm() {
      const element = disclosure.current;
      if (!element) {
        return;
      }
      element.open = true;
      element.scrollIntoView({ block: "start" });
      element
        .querySelector<HTMLInputElement>("input[name=name]")
        ?.focus({ preventScroll: true });
    }
    function followHash() {
      if (window.location.hash === "#" + id) {
        openForm();
      }
    }
    function followLink(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      ) {
        return;
      }
      const link = event.target.closest("a");
      if (
        link?.hash === "#" + id &&
        link.origin === window.location.origin &&
        link.pathname === window.location.pathname &&
        link.search === window.location.search
      ) {
        event.preventDefault();
        if (window.location.hash !== link.hash) {
          // Keep the App Router in sync when a successful save refreshes the list.
          window.history.pushState(null, "", link.hash);
        }
        openForm();
      }
    }
    followHash();
    window.addEventListener("hashchange", followHash);
    document.addEventListener("click", followLink);
    return () => {
      window.removeEventListener("hashchange", followHash);
      document.removeEventListener("click", followLink);
    };
  }, [id]);
  return (
    <details
      ref={disclosure}
      id={id}
      open={initiallyOpen}
      className={styles.createDisclosure}
    >
      <summary>{label}</summary>
      <div className={styles.toolBody}>{children}</div>
    </details>
  );
}
