import { PolicyPage } from "../../components/policy-page";

export const metadata = {
  title: "Privacy Policy",
  description: "How RelayHub handles account, security and webhook data.",
};

export default function PrivacyPage() {
  return (
    <PolicyPage title="Privacy Policy">
      <p>
        This notice applies to the hosted RelayHub service at
        relayhub-webhooks.vercel.app.
      </p>
      <h2>Who operates RelayHub</h2>
      <p>
        Giacomo Negri operates the hosted service. For questions or privacy
        requests, use the contact details on the{" "}
        <a href="https://github.com/jacknegri89">operator’s GitHub profile</a>.
        Keep account details and webhook payloads out of public issues.
      </p>
      <h2>Data and purposes</h2>
      <ul>
        <li>
          <strong>Account data.</strong> Name, email, and password hash support
          registration and sign-in. If you enable two-factor authentication, the
          service stores encrypted authenticator data and recovery codes.
        </li>
        <li>
          <strong>Workspace and delivery data.</strong> Membership, routing
          configuration, encrypted webhook payloads and signing keys, and
          delivery metadata support routing, retries, and delivery history.
          Authorized workspace members can see operational metadata.
        </li>
        <li>
          <strong>Security and operations.</strong> Session identifiers, request
          counters, and log metadata help prevent abuse and diagnose service
          problems.
        </li>
      </ul>
      <p>
        RelayHub processes account and routing data to provide the service you
        request. Security and diagnostic processing supports the operator’s
        legitimate interest in keeping the service reliable and protecting
        accounts.
      </p>
      <h2>Who receives data</h2>
      <p>
        Vercel hosts the web and worker services. Neon provides PostgreSQL and
        Upstash provides the Redis queue. These services support RelayHub’s
        operation. Delivery sends webhook contents to the destinations
        configured by workspace operators. Select destinations you are
        authorized to use.
      </p>
      <h2>Retention</h2>
      <p>
        Account and configuration records are kept while needed to operate the
        account or workspace. Terminal delivery records and audit history are
        removed after the configured retention period. Pending deliveries remain
        available for retry. Backup and provider log retention may differ from
        the live service.
      </p>
      <h2>Your choices and rights</h2>
      <p>
        You can sign out and manage two-factor authentication from your
        workspace. Where applicable, you can request access, correction,
        deletion, restriction, or portability, object to certain processing, and
        lodge a complaint with your data-protection authority.
      </p>
    </PolicyPage>
  );
}
