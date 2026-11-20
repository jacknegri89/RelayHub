"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import styles from "./relay-preview.module.css";

gsap.registerPlugin(useGSAP);

type Scenario = "success" | "retry";
type Stage = "ready" | "sending" | "queued" | "retrying" | "delivered";

const stageLabel: Record<Stage, string> = {
  ready: "Ready to simulate",
  sending: "Sending signed event",
  queued: "202 · Event queued",
  retrying: "503 · Retry scheduled",
  delivered: "204 · Delivered",
};

export function RelayPreview() {
  const consoleRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const packetRef = useRef<HTMLSpanElement>(null);
  const busy = useRef(false);
  const [scenario, setScenario] = useState<Scenario>("success");
  const [stage, setStage] = useState<Stage>("ready");
  const { contextSafe } = useGSAP({ scope: consoleRef });

  const simulate = contextSafe((nextScenario: Scenario) => {
    const track = trackRef.current;
    const packet = packetRef.current;
    if (!track || !packet || busy.current) {
      return;
    }
    setScenario(nextScenario);
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) {
      setStage("delivered");
      return;
    }

    busy.current = true;
    setStage("sending");
    const length = track.clientWidth - packet.offsetWidth;
    const midpoint = length * 0.5;
    const timeline = gsap.timeline({
      onComplete() {
        busy.current = false;
        setStage("delivered");
      },
    });
    timeline
      .set(packet, { x: 0, opacity: 1 })
      .to(packet, { x: midpoint, duration: 0.58, ease: "power2.inOut" })
      .call(() => setStage("queued"))
      .to(packet, { x: length, duration: 0.55, ease: "power2.inOut" });

    if (nextScenario === "retry") {
      timeline
        .call(() => setStage("retrying"))
        .to(packet, { x: midpoint, duration: 0.42, ease: "power2.out" })
        .to(
          packet,
          { x: length, duration: 0.54, ease: "power2.inOut" },
          "+=0.28",
        );
    }
    timeline.to(packet, {
      opacity: 0,
      duration: 0.18,
      clearProps: "transform,opacity",
    });
  });

  function arrived() {
    return stage === "delivered" || stage === "retrying";
  }

  const running = stage !== "ready" && stage !== "delivered";
  return (
    <section
      ref={consoleRef}
      className={styles.console}
      aria-label="Webhook simulator"
    >
      <header className={styles.consoleHeader}>
        <span>
          <span className={styles.indicator} aria-hidden="true" /> Event
          simulator
        </span>
        <span className={styles.consoleTag}>Browser simulation</span>
      </header>
      <div className={styles.diagram} data-stage={stage}>
        <div className={styles.wire} ref={trackRef} aria-hidden="true">
          <span className={styles.packet} ref={packetRef} />
        </div>
        <div className={styles.station}>
          <span className={styles.port} aria-hidden="true">
            IN
          </span>
          <span>Sender</span>
          <small>HTTP POST</small>
        </div>
        <div className={styles.station}>
          <span className={styles.processor} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>RelayHub</span>
          <small>Signed queue</small>
        </div>
        <div className={styles.station} data-arrived={arrived()}>
          <span className={styles.port} aria-hidden="true">
            OUT
          </span>
          <span>Receiver</span>
          <small>HTTPS</small>
        </div>
      </div>
      <div className={styles.telemetry}>
        <code>order.created</code>
        <span role="status" data-stage={stage}>
          {stageLabel[stage]}
        </span>
      </div>
      {stage === "delivered" && scenario === "retry" && (
        <p className={styles.history}>
          Attempt 1 returned 503. Attempt 2 returned 204.
        </p>
      )}
      <div className={styles.controls} aria-label="Delivery scenarios">
        <button
          type="button"
          disabled={running}
          onClick={() => simulate("success")}
        >
          Simulate delivery
        </button>
        <button
          type="button"
          disabled={running}
          onClick={() => simulate("retry")}
        >
          Simulate retry
        </button>
      </div>
    </section>
  );
}
