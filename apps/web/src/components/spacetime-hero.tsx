"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useLocale } from "./locale";
import {
  MAX_ATTEMPTS,
  SpacetimeModel,
  orderInProgress,
  snapshotOrder,
  type Endpoint,
  type Journey,
  type JourneyNotice,
  type OrderSnapshot,
} from "./spacetime-model";
import { SimulatorRoutes, OutcomeLabel } from "./simulator-routes";
import { SpacetimeRenderer, type SpacetimeLabels } from "./spacetime-renderer";
import styles from "./spacetime-hero.module.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const RANDOM_SEED = 20261120;
const PREWARM_SECONDS = 9;
const STATIC_FEATURED_SECONDS = 6.8;
const STATIC_VISITOR_SECONDS = 4;
const INTRO_REVEAL_SECONDS = 1.9;
const FEATURED_EVENT_DELAY_SECONDS = 0.55;
const MOTION_QUERY = "(prefers-reduced-motion: no-preference)";
const STATIC_QUERY = "(prefers-reduced-motion: reduce)";

type Engine = { model: SpacetimeModel; renderer: SpacetimeRenderer };
type Tooltip = {
  x: number;
  y: number;
  leftOfPointer: boolean;
  journey: OrderSnapshot;
};
type LoggedNotice = JourneyNotice & { key: number };

const destinationNames: Record<Endpoint, [string, string]> = {
  a: ["Warehouse", "Magazzino"],
  b: ["Billing", "Fatturazione"],
  c: ["Email", "Email"],
};

export function SpacetimeHero() {
  const { locale, t } = useLocale();
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const animated = useRef(false);
  const paused = useRef(false);
  const noticeKey = useRef(0);
  const selected = useRef<Journey | null>(null);
  const [order, setOrder] = useState<OrderSnapshot | null>(null);
  const [timeline, setTimeline] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [canPause, setCanPause] = useState(false);
  const [online, setOnline] = useState<Record<Endpoint, boolean>>({
    a: true,
    b: true,
    c: true,
  });
  const [notices, setNotices] = useState<LoggedNotice[]>([]);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const labels: SpacetimeLabels = {
    sender: t("Shop", "Negozio"),
    destinations: {
      a: t(...destinationNames.a),
      b: t(...destinationNames.b),
      c: t(...destinationNames.c),
    },
    now: t("Now", "Ora"),
    end: t("End", "Fine"),
    time: t("Time", "Tempo"),
    verified: t("verified", "verificata"),
    rejected: t("signature mismatch", "firma non valida"),
    delivered: t("delivered", "consegnato"),
    retry: t("retry", "tentativo"),
    failed: t("failed", "fallito"),
  };
  const latestLabels = useRef(labels);
  latestLabels.current = labels;

  // Redraw canvas text in the new language without restarting the scene.
  useEffect(() => {
    const current = engine.current;
    if (!current) {
      return;
    }
    current.renderer.setLabels(latestLabels.current);
    current.renderer.draw();
  }, [locale]);

  useGSAP(
    () => {
      const surface = canvas.current;
      if (!surface) {
        return;
      }
      const container = stage.current ?? surface;
      const model = new SpacetimeModel(RANDOM_SEED);
      model.fastForward(PREWARM_SECONDS);
      const renderer = new SpacetimeRenderer(
        surface,
        model,
        latestLabels.current,
      );
      engine.current = { model, renderer };
      model.onNotice = (notice, journey) => {
        if (journey !== selected.current) {
          return;
        }
        setOrder(snapshotOrder(journey));
        if (notice.origin !== "visitor") {
          return;
        }
        noticeKey.current += 1;
        const logged = { ...notice, key: noticeKey.current };
        setNotices((previous) => [logged, ...previous]);
      };

      function startExample() {
        if (!selected.current) {
          selected.current = model.emitFeaturedEvent();
          setOrder(snapshotOrder(selected.current));
        }
      }

      function fitCanvas() {
        if (!surface) {
          return;
        }
        renderer.resize(surface.clientWidth, surface.clientHeight);
        renderer.draw();
      }
      const observer = new ResizeObserver(fitCanvas);
      observer.observe(surface);
      fitCanvas();
      void document.fonts.ready.then(() => renderer.draw());

      const media = gsap.matchMedia();
      media.add(MOTION_QUERY, () => {
        animated.current = true;
        setCanPause(true);
        const clock = { scale: 1 };
        let visible = true;

        function advanceFrame(_time: number, deltaMilliseconds: number) {
          if (paused.current || !visible) {
            return;
          }
          model.advance((deltaMilliseconds / 1000) * clock.scale);
          renderer.draw();
        }
        gsap.ticker.add(advanceFrame);

        const visibility = new IntersectionObserver(([entry]) => {
          visible = Boolean(entry?.isIntersecting);
        });
        visibility.observe(container);

        renderer.reveal = 0;
        gsap
          .timeline()
          .to(renderer, {
            reveal: 1,
            duration: INTRO_REVEAL_SECONDS,
            ease: "power2.inOut",
          })
          .call(startExample, [], FEATURED_EVENT_DELAY_SECONDS);

        // Time itself slows down as the visitor scrolls past the diagram.
        ScrollTrigger.create({
          trigger: container,
          start: "top top",
          end: "bottom top",
          scrub: true,
          onUpdate: (trigger) => {
            clock.scale = 1 - trigger.progress * 0.8;
          },
        });

        return () => {
          gsap.ticker.remove(advanceFrame);
          visibility.disconnect();
          animated.current = false;
        };
      });
      media.add(STATIC_QUERY, () => {
        setCanPause(false);
        setIsPaused(false);
        paused.current = false;
        renderer.reveal = 1;
        renderer.holdAnnotations = true;
        if (!selected.current || selected.current.origin === "featured") {
          startExample();
          model.fastForward(STATIC_FEATURED_SECONDS);
        }
        renderer.draw();
        return () => {
          renderer.holdAnnotations = false;
        };
      });

      return () => {
        observer.disconnect();
        media.revert();
        model.onNotice = undefined;
        selected.current = null;
        engine.current = null;
      };
    },
    { scope: stage },
  );

  function refreshStaticFrame(seconds: number) {
    const current = engine.current;
    if (!current || animated.current) {
      return;
    }
    current.model.fastForward(seconds);
    current.renderer.draw();
  }

  function sendEvent(tampered: boolean) {
    const current = engine.current;
    if (!current) {
      return;
    }
    selected.current = current.model.emitVisitorEvent(tampered);
    current.renderer.trackedOrder = selected.current;
    setOrder(snapshotOrder(selected.current));
    setNotices([]);
    leave();
    refreshStaticFrame(STATIC_VISITOR_SECONDS);
  }

  function toggleEndpoint(endpoint: Endpoint) {
    const current = engine.current;
    if (!current) {
      return;
    }
    const next = !current.model.online[endpoint];
    current.model.setOnline(endpoint, next);
    setOnline({ ...current.model.online });
    current.renderer.draw();
  }

  function togglePause() {
    paused.current = !paused.current;
    setIsPaused(paused.current);
  }

  function nextStep() {
    if (engine.current && selected.current) {
      engine.current.model.advanceOrder(selected.current);
      engine.current.renderer.draw();
      if (!orderInProgress(selected.current)) {
        stage.current
          ?.querySelector<HTMLElement>('[role="status"]')
          ?.focus({ preventScroll: true });
      }
    }
  }

  function inspect(event: PointerEvent<HTMLCanvasElement>) {
    const current = engine.current;
    if (!current) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
    current.renderer.pointer = point;
    const journey = current.renderer.pick(point);
    if (!journey) {
      current.renderer.highlightId = null;
      setTooltip(null);
    } else {
      current.renderer.highlightId = journey.id;
      setTooltip({
        x: point.x,
        y: Math.max(65, Math.min(point.y, bounds.height - 65)),
        leftOfPointer: point.x > bounds.width / 2,
        journey: snapshotOrder(journey),
      });
    }
    if (!animated.current || paused.current) {
      current.renderer.draw();
    }
  }

  function leave() {
    const current = engine.current;
    if (!current) {
      return;
    }
    current.renderer.pointer = null;
    current.renderer.highlightId = null;
    setTooltip(null);
    current.renderer.draw();
  }

  const canStep = (!canPause || isPaused) && orderInProgress(order);

  return (
    <div
      id="simulator"
      ref={stage}
      className={styles.stage}
      role="region"
      aria-labelledby="simulator-title"
    >
      <div className={styles.instrumentHead}>
        <h2 id="simulator-title">
          {t("Delivery simulator", "Simulatore di consegna")}
        </h2>
        <div
          className={styles.views}
          role="group"
          aria-label={t("Diagram view", "Vista del diagramma")}
        >
          <button
            type="button"
            aria-pressed={!timeline}
            onClick={() => setTimeline(false)}
          >
            {t("Route", "Percorso")}
          </button>
          <button
            type="button"
            aria-pressed={timeline}
            onClick={() => setTimeline(true)}
          >
            {t("Timeline", "Cronologia")}
          </button>
        </div>
      </div>
      <div
        className={styles.controls}
        role="group"
        aria-label={t("Diagram controls", "Comandi del diagramma")}
      >
        <button
          type="button"
          className={styles.fire}
          onClick={() => sendEvent(false)}
        >
          <span aria-hidden="true" className={styles.playIcon} />
          {t("Send a test order", "Invia un ordine di prova")}
        </button>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => sendEvent(true)}
        >
          {t("Tamper with the signature", "Altera la firma")}
        </button>
        {canPause && (
          <button
            type="button"
            className={styles.pause}
            aria-pressed={isPaused}
            onClick={togglePause}
          >
            <span data-visible={!isPaused}>
              {t("Pause time", "Ferma il tempo")}
            </span>
            <span data-visible={isPaused}>
              {t("Resume time", "Riprendi il tempo")}
            </span>
          </button>
        )}
        {canStep && (
          <button type="button" className={styles.ghost} onClick={nextStep}>
            {t("Next step", "Passo successivo")}
          </button>
        )}
      </div>
      <figure
        hidden={!timeline}
        className={styles.figure}
        aria-label={t(
          "Spacetime diagram of webhook deliveries",
          "Diagramma spazio-tempo delle consegne dei webhook",
        )}
      >
        <div className={styles.plot}>
          <canvas
            ref={canvas}
            className={styles.canvas}
            aria-hidden="true"
            onPointerMove={inspect}
            onPointerDown={inspect}
            onPointerLeave={leave}
          />
          {tooltip && <TooltipCard tooltip={tooltip} />}
        </div>
        <figcaption className={styles.legend}>
          <span className="sr-only">
            {t(
              "Simulated time runs left to right. Follow the order from the shop through RelayHub to the warehouse, billing and email. Each lane labels the latest result for the highlighted order.",
              "Il tempo simulato scorre da sinistra a destra. Segui l’ordine dal negozio, attraverso RelayHub, fino a magazzino, fatturazione ed email. Ogni riga indica l’ultimo esito visibile dell’ordine evidenziato.",
            )}
          </span>
          <span className={styles.keySend}>{t("Sending", "Invio")}</span>
          <span className={styles.keyReceived}>
            {t("Delivered", "Consegnato")}
          </span>
          <span className={styles.keyError}>{t("Error", "Errore")}</span>
          <span className={styles.keyWait}>
            {t("Retry delay", "Attesa tra i tentativi")}
          </span>
        </figcaption>
      </figure>

      <SimulatorRoutes
        order={order}
        names={labels.destinations}
        online={online}
        toggle={toggleEndpoint}
        timeline={timeline}
        paused={!canPause || isPaused}
      />
      <div className={styles.console}>
        <p className={styles.hint}>
          {t(
            "Switch a service offline to get a 503. Bring it back online before the next attempt to deliver the same order.",
            "Spegni un servizio per simulare un errore 503. Riaccendilo prima del prossimo tentativo per consegnare lo stesso ordine.",
          )}
        </p>
        {order?.origin === "visitor" && (
          <details className={styles.history}>
            <summary>
              {t("Order history", "Cronologia dell’ordine")}{" "}
              <code>{order.code}</code>
            </summary>
            <ol
              className={styles.log}
              aria-label={t("Your events", "I tuoi eventi")}
            >
              {notices.map((notice) => (
                <li key={notice.key} data-kind={notice.kind}>
                  <NoticeText notice={notice} />
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    </div>
  );
}

function TooltipCard({ tooltip }: { tooltip: Tooltip }) {
  const { t } = useLocale();
  const { journey } = tooltip;
  let offset = "0.7rem";
  if (tooltip.leftOfPointer) {
    offset = "calc(0px - var(--tip-width) - 0.7rem)";
  }
  const left = `clamp(0.4rem, calc(${tooltip.x}px + ${offset}), calc(100% - var(--tip-width) - 0.4rem))`;
  return (
    <div
      className={styles.tooltip}
      style={{ left, top: tooltip.y }}
      aria-hidden="true"
    >
      <strong>{journey.type}</strong>
      <code>{journey.code}</code>
      {journey.accepted === false && (
        <span data-tone="failed">
          401 ·{" "}
          {t("signature mismatch, rejected", "firma non valida, rifiutato")}
        </span>
      )}
      {journey.deliveries.map((delivery) => (
        <span key={delivery.endpoint} data-tone={delivery.outcome}>
          {t(...destinationNames[delivery.endpoint])} ·{" "}
          {t("attempt", "tentativo")} {delivery.attempts}
          {delivery.status !== null && " · " + delivery.status}
          {" · "}
          <OutcomeLabel outcome={delivery.outcome} />
        </span>
      ))}
    </div>
  );
}

function NoticeText({ notice }: { notice: JourneyNotice }) {
  const { t } = useLocale();
  let name = "";
  if (notice.endpoint) {
    name = t(...destinationNames[notice.endpoint]);
  }
  const attempt = notice.attempt ?? 1;
  if (notice.kind === "resending") {
    return (
      <>
        {name} · {t("sending attempt", "invio del tentativo")} {attempt}
      </>
    );
  }
  if (notice.kind === "rejected") {
    return (
      <>
        <code>{notice.code}</code>{" "}
        {t(
          "signature mismatch: rejected with 401, nothing delivered.",
          "firma non valida: rifiutato con 401, nessuna consegna.",
        )}
      </>
    );
  }
  if (notice.kind === "accepted") {
    return (
      <>
        <code>{notice.code}</code> {notice.type}{" "}
        {t(
          "verified and routed to 3 endpoints.",
          "verificato e instradato a 3 endpoint.",
        )}
      </>
    );
  }
  if (notice.kind === "delivered") {
    return (
      <>
        <code>{notice.code}</code> → {name}:{" "}
        {t("delivered on attempt", "consegnato al tentativo")} {attempt} (
        {notice.status}).
      </>
    );
  }
  if (notice.kind === "retrying") {
    return (
      <>
        <code>{notice.code}</code> → {name}: {notice.status}.{" "}
        {t("Retry", "Tentativo")} {attempt + 1}/{MAX_ATTEMPTS}{" "}
        {t("scheduled with backoff.", "programmato con attesa crescente.")}
      </>
    );
  }
  return (
    <>
      <code>{notice.code}</code> → {name}: {t("failed after", "fallito dopo")}{" "}
      {attempt} {t("attempts.", "tentativi.")}
    </>
  );
}
