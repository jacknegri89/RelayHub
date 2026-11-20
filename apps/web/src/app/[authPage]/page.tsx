import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Brand } from "../../components/brand";
import { ActionForm } from "../../components/forms";
import { Motion } from "../../components/motion";
import { PageHeading } from "../../components/page-heading";
import { issueFormProof } from "../../server/form-proof";
import { PolicyLinks } from "../../components/policy-links";

export default async function AuthPage({
  params,
}: {
  params: Promise<{ authPage: string }>;
}) {
  const { authPage } = await params;
  if (!["login", "register", "verify"].includes(authPage)) {
    notFound();
  }
  await connection();
  const registering = authPage === "register";
  const verifying = authPage === "verify";
  let title = "Sign in";
  let endpoint = "/api/auth/sign-in/email";
  let passwordAutocomplete = "current-password";
  if (registering) {
    title = "Create an account";
    endpoint = "/api/auth/sign-up/email";
    passwordAutocomplete = "new-password";
  }
  if (verifying) {
    title = "Verify your sign-in";
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
          {verifying && <VerifySignIn />}
          {!verifying && (
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
          )}
          {registering && (
            <p>
              Already registered? <Link href="/login">Sign in</Link>
            </p>
          )}
          {!registering && !verifying && (
            <p>
              New to RelayHub? <Link href="/register">Create an account</Link>
            </p>
          )}
          <PolicyLinks />
        </div>
      </section>
    </main>
  );
}

function VerifySignIn() {
  return (
    <>
      <p>Enter the six-digit code from your authenticator app.</p>
      <ActionForm
        endpoint="/api/auth/two-factor/verify-totp"
        label="Verify code"
        nextPath="/workspace"
      >
        <label>
          Authenticator code
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
          />
        </label>
      </ActionForm>
      <details className="factor-details">
        <summary>Use a recovery code</summary>
        <ActionForm
          endpoint="/api/auth/two-factor/verify-backup-code"
          label="Verify recovery code"
          nextPath="/workspace"
        >
          <label>
            Recovery code
            <input
              name="code"
              autoComplete="off"
              spellCheck={false}
              maxLength={64}
              required
            />
          </label>
        </ActionForm>
      </details>
      <p>
        <Link href="/login">Back to sign in</Link>
      </p>
    </>
  );
}
