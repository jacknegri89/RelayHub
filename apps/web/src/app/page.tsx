import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "../server/auth";
import { Brand } from "../components/brand";
import { RelayPreview } from "../components/relay-preview";
import styles from "./landing.module.css";

export default async function Home() {
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });
  if (session) {
    redirect("/workspace");
  }
  return (
    <div className={styles.landing}>
      <header className={styles.header}>
        <Link href="/" aria-label="RelayHub home">
          <Brand />
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/login">Sign in</Link>
        </nav>
      </header>
      <main id="main">
        <section className={styles.hero}>
          <div className={styles.copy}>
            <h1>
              Webhooks.<span>Under control.</span>
            </h1>
            <p>
              Route signed events, watch every delivery, and recover from failed
              requests.
            </p>
            <div className={styles.actions}>
              <Link href="/register">
                Create demo account <span aria-hidden="true">↗</span>
              </Link>
              <a href="#simulator">
                Try the simulator <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>
          <div className={styles.preview} id="simulator">
            <RelayPreview />
          </div>
        </section>
        <section className={styles.flow} aria-labelledby="delivery-flow">
          <h2>From source to receiver</h2>
          <ol>
            <li>
              <strong>Receive</strong>
              <p>Verify the signature and reject duplicate events.</p>
            </li>
            <li>
              <strong>Route</strong>
              <p>Match event types to destinations and queue the deliveries.</p>
            </li>
            <li>
              <strong>Recover</strong>
              <p>
                Inspect each attempt and retry failures from the delivery log.
              </p>
            </li>
          </ol>
        </section>
      </main>
      <footer className={styles.footer}>
        <p>RelayHub · Webhook delivery</p>
        <Link href="/register">
          Try a real delivery <span aria-hidden="true">↗</span>
        </Link>
      </footer>
    </div>
  );
}
