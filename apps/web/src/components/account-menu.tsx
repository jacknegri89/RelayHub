"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useLocale } from "./locale";
import { InterfaceIcon } from "./interface-icon";
import { ActionForm } from "./forms";
import { ProfileAvatar } from "./profile-avatar";
import { profileAvatar } from "../profile-avatars";

export function AccountMenu({
  email,
  name,
  image,
}: {
  email: string;
  name: string;
  image?: string | null;
}) {
  const { t } = useLocale();
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (
        menu.current?.open &&
        event.target instanceof Node &&
        !menu.current.contains(event.target)
      ) {
        menu.current.open = false;
      }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  function close() {
    if (menu.current) {
      menu.current.open = false;
    }
  }

  return (
    <details
      ref={menu}
      className="account-menu"
      onKeyDown={(event) => {
        if (event.key === "Escape" && menu.current?.open) {
          close();
          trigger.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        ) {
          close();
        }
      }}
    >
      <summary ref={trigger} aria-label={t("Account menu", "Menu account")}>
        <ProfileAvatar name={name} avatar={profileAvatar(image)} small />{" "}
        <span className="account-trigger-label">Account</span>
      </summary>
      <div className="account-options">
        <div className="account-email">
          <strong>{name}</strong>
          <span>{email}</span>
        </div>
        <Link href="/workspace/profile" onClick={close}>
          <InterfaceIcon name="account" />
          {t("Profile", "Profilo")}
        </Link>
        <Link className="account-workspace" href="/workspace" onClick={close}>
          <InterfaceIcon name="workspace" />
          {t("Workspace", "Area di lavoro")}
        </Link>
        <Link href="/workspace/security" onClick={close}>
          <InterfaceIcon name="security" />
          {t("Security", "Sicurezza")}
        </Link>
        <ActionForm
          endpoint="/api/auth/sign-out"
          label={t("Sign out", "Esci")}
          nextPath="/login"
        />
      </div>
    </details>
  );
}
