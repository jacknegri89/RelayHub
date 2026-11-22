"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import type { getAccountDeletionPlan } from "../server/account-privacy";
import { ActionForm } from "./forms";
import { useLocale } from "./locale";
import styles from "./personal-workspace.module.css";

type DeletionPlan = Awaited<ReturnType<typeof getAccountDeletionPlan>>;
type PrivacyAction = "delete" | "export";

const errors: Record<string, [string, string]> = {
  invalid_password: ["The password is incorrect.", "La password è errata."],
  authentication_required: [
    "Your session has ended.",
    "La sessione è terminata.",
  ],
  fresh_login_required: [
    "Sign out and sign in again with your second factor. Then return to your profile.",
    "Esci e accedi di nuovo con il secondo fattore, poi torna al profilo.",
  ],
  organization_plan_changed: [
    "The members or owners of your organizations have changed. Reload your profile and review the choices.",
    "I membri o i proprietari delle tue organizzazioni sono cambiati. Ricarica il profilo e ricontrolla le scelte.",
  ],
  profile_form_expired: [
    "Reload your profile to continue.",
    "Ricarica il profilo per continuare.",
  ],
  rate_limited: [
    "Too many attempts. Try again later.",
    "Troppi tentativi. Riprova più tardi.",
  ],
  invalid_privacy_request: [
    "Check the information in the form and try again.",
    "Ricontrolla i dati del modulo e riprova.",
  ],
  unavailable: [
    "RelayHub could not confirm the result. Check your connection and sign-in status before trying again.",
    "RelayHub non ha potuto confermare l’esito. Controlla la connessione e lo stato dell’accesso prima di riprovare.",
  ],
};

function deletionChoices(organizations: DeletionPlan, form: FormData) {
  const deleteOrganizations: string[] = [];
  const successors: { organizationId: string; userId: string }[] = [];
  for (const organization of organizations) {
    const value = form.get(organization.id);
    if (value === "delete") {
      deleteOrganizations.push(organization.id);
    } else if (typeof value === "string" && value) {
      successors.push({ organizationId: organization.id, userId: value });
    }
  }
  return {
    confirm: form.get("confirm") === "yes",
    deleteOrganizations,
    successors,
  };
}

async function downloadExport(response: Response) {
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = "relayhub-account.json";
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to start reading the file before releasing the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function OwnershipChoices({ organizations }: { organizations: DeletionPlan }) {
  const { t } = useLocale();
  return organizations.map((organization) => (
    <fieldset key={organization.id} className={styles.ownershipChoice}>
      <legend>{organization.name}</legend>
      {organization.members.length === 0 && (
        <label className="check">
          <input
            type="checkbox"
            required
            name={organization.id}
            value="delete"
          />
          {t(
            "I am the only member. Delete this organization, its routes, events and delivery history.",
            "Sono l’unico membro. Elimina questa organizzazione, le sue regole, gli eventi e lo storico delle consegne.",
          )}
        </label>
      )}
      {organization.members.length > 0 && (
        <label>
          {t("Transfer ownership to", "Trasferisci la proprietà a")}
          <select name={organization.id} defaultValue="" required>
            <option value="" disabled>
              {t("Choose a member", "Scegli un membro")}
            </option>
            {organization.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name} · {member.id}
              </option>
            ))}
          </select>
        </label>
      )}
    </fieldset>
  ));
}

function PrivacyForm({
  action,
  csrfToken,
  organizations = [],
}: {
  action: PrivacyAction;
  csrfToken: string;
  organizations?: DeletionPlan;
}) {
  const { t } = useLocale();
  const busy = useRef(false);
  const deletionNotice = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const deleting = action === "delete";
  let buttonText = t("Download JSON", "Scarica il file JSON");
  if (deleting) {
    buttonText = t(
      "Permanently delete my account",
      "Cancella definitivamente il mio account",
    );
  }
  if (pending) {
    buttonText = t("Working…", "Attendi…");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) {
      return;
    }
    const form = event.currentTarget;
    const values = new FormData(form);
    const body = { action, csrfToken, password: values.get("password") };
    let payload: object = body;
    if (deleting) {
      payload = { ...body, ...deletionChoices(organizations, values) };
    }
    busy.current = true;
    setPending(true);
    setDownloaded(false);
    setError("");
    try {
      const response = await fetch("/api/profile/privacy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      if (!response.ok) {
        const result = await response.json();
        setError(result.error ?? "unavailable");
        return;
      }
      form.reset();
      if (deleting) {
        deletionNotice.current?.showModal();
        return;
      }
      await downloadExport(response);
      setDownloaded(true);
    } catch {
      setError("unavailable");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <form
        method="post"
        action="/api/profile/privacy"
        onSubmit={submit}
        className={styles.privacyForm}
      >
        <noscript>
          <p>
            {t(
              "Enable JavaScript to use this form or contact the operator through the privacy notice.",
              "Attiva JavaScript per usare questo modulo oppure contatta il titolare tramite l’informativa privacy.",
            )}
          </p>
        </noscript>
        {deleting && <OwnershipChoices organizations={organizations} />}
        <label>
          {t("Current password", "Password attuale")}
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
            placeholder={t(
              "Your account password",
              "La password del tuo account",
            )}
          />
        </label>
        {deleting && (
          <label className="check">
            <input name="confirm" type="checkbox" value="yes" required />
            {t(
              "I confirm permanent account deletion.",
              "Confermo la cancellazione definitiva del mio account.",
            )}
          </label>
        )}
        <button type="submit" disabled={pending} data-destructive={deleting}>
          {buttonText}
        </button>
        {downloaded && (
          <p role="status" className="form-success">
            {t("Your download has started.", "Il download è iniziato.")}
          </p>
        )}
        {error && (
          <p role="alert" className="error-text">
            {t(...(errors[error] ?? errors.unavailable))}{" "}
            {error === "authentication_required" && (
              <Link href="/login">{t("Sign in", "Accedi")}</Link>
            )}
            {(error === "profile_form_expired" ||
              error === "organization_plan_changed") && (
              <button type="button" onClick={() => window.location.reload()}>
                {t("Reload profile", "Ricarica profilo")}
              </button>
            )}
          </p>
        )}
      </form>
      {deleting && (
        <dialog
          ref={deletionNotice}
          className={styles.deletionNotice}
          aria-labelledby="account-deleted-title"
          onCancel={(event) => {
            event.preventDefault();
            window.location.replace("/login");
          }}
        >
          <h2 id="account-deleted-title">
            {t(
              "Your account has been deleted.",
              "Il tuo account è stato cancellato.",
            )}
          </h2>
          <p>
            {t(
              "All your sessions have ended.",
              "Tutte le tue sessioni sono state chiuse.",
            )}
          </p>
          <button
            type="button"
            onClick={() => window.location.replace("/login")}
          >
            {t("Go to sign in", "Vai all’accesso")}
          </button>
        </dialog>
      )}
      {error === "fresh_login_required" && (
        <ActionForm
          endpoint="/api/auth/sign-out"
          label={t(
            "Sign out to verify again",
            "Esci per verificare di nuovo l’identità",
          )}
          nextPath="/login"
        />
      )}
    </>
  );
}

export function ProfilePrivacy({
  csrfToken,
  organizations,
}: {
  csrfToken: string;
  organizations: DeletionPlan;
}) {
  const { t } = useLocale();
  return (
    <section className={styles.panel} aria-labelledby="personal-data">
      <div className={styles.panelBody}>
        <h2 id="personal-data">
          {t("Your personal data", "I tuoi dati personali")}
        </h2>
        <p>
          <Link href="/privacy#rights">
            {t(
              "Privacy rights and contact details",
              "Diritti privacy e contatti",
            )}
          </Link>
        </p>
      </div>
      <details className={styles.privacyTask}>
        <summary>
          {t("Download my account data", "Scarica i dati del mio account")}
        </summary>
        <div>
          <p>
            {t(
              "Save a copy of your profile and account activity in JSON.",
              "Salva una copia del tuo profilo e dell’attività del tuo account in formato JSON.",
            )}
          </p>
          <PrivacyForm action="export" csrfToken={csrfToken} />
        </div>
      </details>
      <details className={styles.privacyTask}>
        <summary>{t("Delete my account", "Cancella il mio account")}</summary>
        <div>
          <p>
            {t(
              "Your profile, sign-in credentials and organization memberships will be removed. All your sessions will end. Shared organizations will keep their webhook records.",
              "La cancellazione elimina il profilo, le credenziali e le tue iscrizioni alle organizzazioni. Tutte le tue sessioni verranno chiuse. Le organizzazioni condivise conserveranno i registri dei webhook.",
            )}
          </p>
          {organizations.length > 0 && (
            <p>
              {t(
                "You are the sole owner of the organizations below. To keep one where you are the only member, add a member first.",
                "Sei l’unico proprietario delle organizzazioni elencate. Per conservarne una di cui sei l’unico membro, aggiungi prima un membro.",
              )}{" "}
              <Link href="/workspace">
                {t("Open organizations", "Apri le organizzazioni")}
              </Link>
            </p>
          )}
          <PrivacyForm
            action="delete"
            csrfToken={csrfToken}
            organizations={organizations}
          />
        </div>
      </details>
    </section>
  );
}
