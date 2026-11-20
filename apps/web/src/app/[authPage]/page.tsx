import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { settings } from "@relayhub/shared/config";
import { Brand } from "../../components/brand";
import { ActionForm } from "../../components/forms";
import { Motion } from "../../components/motion";
import { PageHeading } from "../../components/page-heading";
import { issueFormProof } from "../../server/form-proof";

export default async function AuthPage({
  params,
}: {
  params: Promise<{ authPage: string }>;
}) {
  const { authPage } = await params;
  if (authPage !== "login" && authPage !== "register") {
    notFound();
  }
  await connection();
  const registering = authPage === "register";
  const requiresInvitation = registering && !settings().isDemo;
  let title = "Sign in";
  let endpoint = "/api/auth/sign-in/email";
  let passwordAutocomplete = "current-password";
  if (registering) {
    title = "Create an account";
    endpoint = "/api/auth/sign-up/email";
    passwordAutocomplete = "new-password";
  }
  return (
    <main id="main" className="auth-shell">
      <aside className="auth-aside">
        <Link href="/" aria-label="RelayHub home">
          <Brand />
        </Link>
        <div className="auth-context">
          <p className="auth-caption">Webhook delivery, end to end.</p>
          <Motion kind="signal" className="auth-route">
            <ol aria-label="How RelayHub handles a webhook">
              <li>
                <span data-joint aria-hidden="true" />
                Sender
              </li>
              <li>
                <span data-joint aria-hidden="true" />
                RelayHub
              </li>
              <li>
                <span data-joint aria-hidden="true" />
                Destination
              </li>
            </ol>
            <div className="auth-trace" aria-hidden="true">
              <span data-trace />
              <span className="signal-packet" data-packet />
            </div>
          </Motion>
          <p>
            Accept signed events, route them to your destinations, and inspect
            every attempt.
          </p>
        </div>
      </aside>
      <section className="auth-content">
        <div className="auth-panel">
          <PageHeading title={title} />
          {requiresInvitation && (
            <p>
              Use your own email address and the invitation code you received.
            </p>
          )}
          <ActionForm endpoint={endpoint} label={title} nextPath="/workspace">
            <input
              type="hidden"
              name="formProof"
              value={issueFormProof(endpoint)}
            />
            <div hidden>
              <label>
                Company website{" "}
                <input name="website" autoComplete="off" tabIndex={-1} />
              </label>
            </div>
            {registering && (
              <label>
                Name{" "}
                <input
                  name="name"
                  autoComplete="name"
                  maxLength={80}
                  required
                />
              </label>
            )}
            {requiresInvitation && (
              <label>
                Invitation code{" "}
                <input
                  name="invite"
                  spellCheck={false}
                  autoCapitalize="none"
                  autoComplete="off"
                  maxLength={43}
                  required
                />
              </label>
            )}
            <label>
              Email{" "}
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
              />
            </label>
            <label>
              Password{" "}
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete={passwordAutocomplete}
                required
              />
            </label>
          </ActionForm>
          {registering && (
            <p>
              Already registered? <Link href="/login">Sign in</Link>
            </p>
          )}
          {!registering && (
            <p>
              New to RelayHub? <Link href="/register">Create an account</Link>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
