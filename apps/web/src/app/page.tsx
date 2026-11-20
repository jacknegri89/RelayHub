import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "../server/auth";
import { Brand } from "../components/brand";
import { RelaySignal } from "../components/relay-signal";
import "@fontsource/barlow-condensed/latin-700.css";
import styles from "./landing.module.css";

export default async function Home() {
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });
  let accountHref = "/register";
  let accountLabel = "Create an account";
  let navigationHref = "/login";
  let navigationLabel = "Sign in";
  if (session) {
    accountHref = "/workspace";
    accountLabel = "Open workspace";
    navigationHref = accountHref;
    navigationLabel = accountLabel;
  }
  return (
    <div className={styles.landing}>
      <header className={styles.header}>
        <Link href="/" aria-label="RelayHub home">
          <Brand />
        </Link>
        <nav aria-label="Main navigation">
          <a className={styles.navFlow} href="#delivery-flow">
            Delivery flow
          </a>
          <Link href={navigationHref}>
            {navigationLabel} <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </header>
      <main id="main">
        <section className={styles.hero}>
          <div className={styles.copy}>
            <h1>
              <span>
                <span data-relay-reveal>Webhooks.</span>
              </span>
              <span>
                <span data-relay-reveal>Under control.</span>
              </span>
            </h1>
            <p>
              Route signed events, watch every delivery, and recover from failed
              requests.
            </p>
            <div className={styles.actions}>
              <Link href={accountHref}>
                {accountLabel} <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
          <RelaySignal />
        </section>
        <section className={styles.flow} aria-labelledby="delivery-flow">
          <h2 id="delivery-flow">
            From source
            <br />
            to receiver.
          </h2>
          <ol data-relay-flow>
            <li>
              <div>
                <strong>Receive</strong>
                <p>Verify the signature and accept each event once.</p>
              </div>
            </li>
            <li>
              <div>
                <strong>Route</strong>
                <p>
                  Match event types to destinations and queue the deliveries.
                </p>
              </div>
            </li>
            <li>
              <div>
                <strong>Recover</strong>
                <p>
                  Inspect each attempt and retry failures from the delivery log.
                </p>
              </div>
            </li>
          </ol>
        </section>
      </main>
      <footer className={styles.footer}>
        <Link href="/" aria-label="RelayHub home">
          <Brand />
        </Link>
        <Link href={accountHref}>
          {accountLabel} <span aria-hidden="true">↗</span>
        </Link>
      </footer>
    </div>
  );
}
