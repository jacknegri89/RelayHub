import Link from "next/link";
import { PolicyPage } from "../../components/policy-page";

export const metadata = {
  title: "Cookie Policy",
  description:
    "The essential cookies RelayHub uses for sessions and authentication.",
};

export default function CookiePage() {
  return (
    <PolicyPage title="Cookie Policy">
      <p>
        RelayHub uses essential first-party cookies for sign-in and account
        security.
      </p>
      <dl className="cookie-list">
        <div>
          <dt>Session token</dt>
          <dd>
            Keeps you signed in so you can use your workspace. In the hosted app
            the session expires after up to seven days from issue or refresh.
            Signing out clears the session.
          </dd>
        </div>
        <div>
          <dt>Two-factor challenge</dt>
          <dd>
            Connects a successful password check to the authenticator or
            recovery-code step. It expires after five minutes.
          </dd>
        </div>
        <div>
          <dt>Session persistence preference</dt>
          <dd>
            When present, helps the sign-in service honor a request to keep the
            session in the current browser only.
          </dd>
        </div>
      </dl>
      <p>
        The hosted application uses these cookies for authentication rather than
        analytics or advertising. You can clear cookies in your browser
        settings. Blocking essential cookies prevents sign-in.
      </p>
      <p>
        See the <Link href="/privacy">Privacy Policy</Link> for details about
        other account and service data.
      </p>
    </PolicyPage>
  );
}
