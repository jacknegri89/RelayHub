"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Motion } from "./motion";

type FormValues = Record<string, string | boolean>;
type Result = {
  id?: string;
  secret?: string;
  eventId?: string;
  twoFactorRedirect?: boolean;
};
const messages: Record<string, string> = {
  permission_denied: "Your role does not allow this action.",
  rate_limited: "Too many requests. Wait a minute and try again.",
  invalid_credentials: "Check your email address and password.",
  INVALID_EMAIL_OR_PASSWORD: "Check your email address and password.",
  USER_ALREADY_EXISTS: "This email address cannot be registered.",
  INVALID_CODE: "The code did not match. Try again.",
  INVALID_BACKUP_CODE: "The recovery code did not match or was already used.",
  INVALID_TWO_FACTOR_COOKIE: "This verification step expired. Sign in again.",
  ACCOUNT_TEMPORARILY_LOCKED:
    "Too many failed codes. Wait before trying again.",
  invalid_factor: "Check the code or password and try again.",
  destination_not_allowed:
    "Use an approved HTTPS hostname or the configured demo receiver.",
  registered_user_not_found: "This ID does not match a registered account.",
  delivery_is_not_failed: "Only failed deliveries can be retried.",
  test_route_unavailable:
    "Enable the destination and add a route for this event type first.",
  source_unavailable: "Enable the source before requesting a test.",
  resource_not_found: "This resource is unavailable.",
  invalid_configuration: "Check the form fields and try again.",
  authentication_required: "Sign in again to continue.",
  form_not_ready:
    "Wait a moment and retry. Reload the form if it has been open for a long time.",
};

export function ActionForm({
  endpoint,
  label,
  children,
  fields = {},
  confirm,
  nextPath,
  onId,
  className,
}: {
  endpoint: string;
  label: string;
  children?: ReactNode;
  fields?: FormValues;
  confirm?: string;
  nextPath?: string;
  onId?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [secret, setSecret] = useState("");
  const [failed, setFailed] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || (confirm && !window.confirm(confirm))) {
      return;
    }
    const form = event.currentTarget;
    const values = { ...fields, ...Object.fromEntries(new FormData(form)) };
    if (form.elements.namedItem("enabled")) {
      values.enabled = values.enabled === "on";
    }
    if (values.secret === "") {
      delete values.secret;
    }

    setPending(true);
    setMessage("");
    setSecret("");
    setFailed(false);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const result: Result & { error?: string; code?: string } =
        await response.json();
      if (!response.ok) {
        setFailed(true);
        setMessage(
          messages[result.error ?? result.code ?? ""] ??
            "The request failed. Check your input and try again.",
        );
        return;
      }
      if (result.secret) {
        setSecret(result.secret);
      }
      if (result.twoFactorRedirect) {
        router.push("/verify");
      } else if (nextPath) {
        router.push(nextPath);
      } else if (onId && result.id) {
        router.push(onId + result.id);
      } else {
        setMessage("Saved.");
      }
      router.refresh();
    } catch {
      setFailed(true);
      setMessage("Could not reach RelayHub. Try again.");
    } finally {
      setPending(false);
    }
  }

  let status = "status";
  let button = label;
  if (failed) {
    status = "alert";
  }
  if (pending) {
    button = "Working…";
  }
  return (
    <form className={className ?? "action-form"} onSubmit={submit}>
      {children}
      <button type="submit" disabled={pending}>
        {button}
      </button>
      {message && (
        <Motion kind="notice">
          <p
            className={(failed && "error-text") || "form-success"}
            role={status}
          >
            {message}
          </p>
        </Motion>
      )}
      {secret && (
        <Motion kind="notice">
          <SecretReveal secret={secret} />
        </Motion>
      )}
    </form>
  );
}

function SecretReveal({ secret }: { secret: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setStatus("Copied.");
    } catch {
      setStatus("Select the secret to copy it.");
    }
  }
  return (
    <div className="secret">
      <label>
        Signing secret{" "}
        <input
          readOnly
          value={secret}
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
      <span className="muted">Save this secret now. It is shown once.</span>
      <button type="button" onClick={copy}>
        Copy secret
      </button>
      <p role="status">{status}</p>
    </div>
  );
}
