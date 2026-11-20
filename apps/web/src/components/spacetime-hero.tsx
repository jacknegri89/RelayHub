"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useLocale } from "./locale";
import {
  ENDPOINTS,
  MAX_ATTEMPTS,
  SpacetimeModel,
  type Endpoint,
  type Journey,
  type JourneyNotice,
} from "./spacetime-model";
import { SpacetimeRenderer, type SpacetimeLabels } from "./spacetime-renderer";
import styles from "./spacetime-hero.module.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const RANDOM_SEED = 20261120;
const PREWARM_SECONDS = 9;
const STATIC_FEATURED_SECONDS = 6.8;
const STATIC_VISITOR_SECONDS = 4;
const INTRO_REVEAL_SECONDS = 1.9;
const FEATURED_EVENT_DELAY_SECONDS = 0.55;
const WIDE_LAYOUT_QUERY = "(min-width: 700px)";
const MOTION_QUERY = "(prefers-reduced-motion: no-preference)";
const STATIC_QUERY = "(prefers-reduced-motion: reduce)";
const LOG_LENGTH = 3;

type Engine = { model: SpacetimeModel; renderer: SpacetimeRenderer };
type Tooltip = { x: number; y: number; journey: JourneySnapshot };
type JourneySnapshot = {
  code: string;
  type: string;
  rejected: boolean;
  deliveries: {
    endpoint: Endpoint;
    attempts: number;
    status: number | null;
    outcome: string;
  }[];
};
type LoggedNotice = JourneyNotice & { key: number };

function snapshot(journey: Journey): JourneySnapshot {
  const deliveries = [];
  for (const delivery of journey.deliveries) {
    const last = delivery.attempts[delivery.attempts.length - 1];
    deliveries.push({
      endpoint: delivery.endpoint,
      attempts: delivery.attempts.length,
      status: last?.status ?? null,
      outcome: delivery.outcome,
    });
  }
  return {
    code: journey.code,
    type: journey.type,
    rejected: journey.accepted === false,
    deliveries,
  };
}

export function SpacetimeHero() {
  const { locale, t } = useLocale();
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const animated = useRef(false);
  const paused = useRef(false);
  const noticeKey = useRef(0);
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
    sender: t("Sender", "Mittente"),
    relay: "RelayHub",
    endpoint: "Endpoint",
    offline: "offline",
    now: t("now", "ora"),
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
      // The stage uses display: contents, so the hero section drives scrolling.
      const container = surface.closest("section") ?? surface;
      const model = new SpacetimeModel(RANDOM_SEED);
      model.fastForward(PREWARM_SECONDS);
      const renderer = new SpacetimeRenderer(
        surface,
        model,
        latestLabels.current,
      );
      engine.current = { model, renderer };
      model.onNotice = (notice) => {
        if (notice.origin !== "visitor") {
          return;
        }
        noticeKey.current += 1;
        const logged = { ...notice, key: noticeKey.current };
        setNotices((previous) => [logged, ...previous].slice(0, LOG_LENGTH));
      };

      const wide = window.matchMedia(WIDE_LAYOUT_QUERY);
      function fitCanvas() {
        if (!surface) {
          return;
        }
        renderer.horizontal = wide.matches;
        renderer.resize(surface.clientWidth, surface.clientHeight);
        renderer.draw();
      }
      const observer = new ResizeObserver(fitCanvas);
      observer.observe(surface);
      wide.addEventListener("change", fitCanvas);
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
          .call(
            () => {
              model.emitFeaturedEvent();
            },
            [],
            FEATURED_EVENT_DELAY_SECONDS,
          );

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
        renderer.reveal = 1;
        renderer.holdAnnotations = true;
        model.emitFeaturedEvent();
        model.fastForward(STATIC_FEATURED_SECONDS);
        renderer.draw();
        return () => {
          renderer.holdAnnotations = false;
        };
      });

      return () => {
        observer.disconnect();
        wide.removeEventListener("change", fitCanvas);
        media.revert();
        model.onNotice = undefined;
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
    current.model.emitVisitorEvent(tampered);
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
      setTooltip({ x: point.x, y: point.y, journey: snapshot(journey) });
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

  return (
    <div ref={stage} className={styles.stage}>
      <figure
        className={styles.figure}
        aria-label={t(
          "Spacetime diagram of webhook deliveries",
          "Diagramma spazio-tempo delle consegne dei webhook",
        )}
      >
        <canvas
          ref={canvas}
          className={styles.canvas}
          aria-hidden="true"
          onPointerMove={inspect}
          onPointerDown={inspect}
          onPointerLeave={leave}
        />
        <figcaption className="sr-only">
          {t(
            "Each signed event travels from the sender to RelayHub. Valid signatures cross the relay and fan out to the endpoints; failed deliveries bounce back and are retried after a growing pause.",
            "Ogni evento firmato viaggia dal mittente a RelayHub. Le firme valide superano il relay e si diramano verso gli endpoint; le consegne fallite rimbalzano e vengono ritentate dopo una pausa crescente.",
          )}
        </figcaption>
        {tooltip && <TooltipCard tooltip={tooltip} />}
      </figure>

      <div className={styles.console} data-intro="console">
        <p className={styles.hint}>
          {t(
            "Try it: send an event, then switch endpoint B off.",
            "Prova: invia un evento, poi spegni l’endpoint B.",
          )}
        </p>
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
            <span aria-hidden="true" className={styles.fireDot} />
            {t("Send a signed event", "Invia un evento firmato")}
          </button>
          <button
            type="button"
            className={styles.ghost}
            onClick={() => sendEvent(true)}
          >
            {t("Tamper with the signature", "Altera la firma")}
          </button>
          <div className={styles.switches}>
            {ENDPOINTS.map((endpoint) => (
              <button
                key={endpoint}
                type="button"
                role="switch"
                aria-checked={online[endpoint]}
                className={styles.switch}
                onClick={() => toggleEndpoint(endpoint)}
              >
                <span className="sr-only">Endpoint </span>
                {endpoint.toUpperCase()}
                <span aria-hidden="true" className={styles.switchState} />
              </button>
            ))}
          </div>
          {canPause && (
            <button
              type="button"
              className={styles.pause}
              aria-pressed={isPaused}
              onClick={togglePause}
            >
              {isPaused && t("Resume time", "Riprendi il tempo")}
              {!isPaused && t("Pause time", "Ferma il tempo")}
            </button>
          )}
        </div>
        <ol
          className={styles.log}
          aria-live="polite"
          aria-label={t("Your events", "I tuoi eventi")}
        >
          {notices.map((notice) => (
            <li key={notice.key} data-kind={notice.kind}>
              <NoticeText notice={notice} />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function TooltipCard({ tooltip }: { tooltip: Tooltip }) {
  const { t } = useLocale();
  const { journey } = tooltip;
  let side = styles.tooltipRight;
  if (typeof window !== "undefined" && tooltip.x > window.innerWidth * 0.6) {
    side = styles.tooltipLeft;
  }
  return (
    <div
      className={styles.tooltip + " " + side}
      style={{ left: tooltip.x, top: tooltip.y }}
      aria-hidden="true"
    >
      <strong>{journey.type}</strong>
      <code>{journey.code}</code>
      {journey.rejected && (
        <span data-tone="failed">
          401 ·{" "}
          {t("signature mismatch, rejected", "firma non valida, rifiutato")}
        </span>
      )}
      {journey.deliveries.map((delivery) => (
        <span key={delivery.endpoint} data-tone={delivery.outcome}>
          {delivery.endpoint.toUpperCase()} · {t("attempt", "tentativo")}{" "}
          {delivery.attempts}
          {delivery.status !== null && " · " + delivery.status}
          {" · "}
          <OutcomeLabel outcome={delivery.outcome} />
        </span>
      ))}
    </div>
  );
}

function OutcomeLabel({ outcome }: { outcome: string }) {
  const { t } = useLocale();
  if (outcome === "delivered") {
    return t("delivered", "consegnato");
  }
  if (outcome === "retrying") {
    return t("retry scheduled", "nuovo tentativo in coda");
  }
  if (outcome === "failed") {
    return t("failed", "fallito");
  }
  return t("in flight", "in viaggio");
}

function NoticeText({ notice }: { notice: JourneyNotice }) {
  const { t } = useLocale();
  const name = "Endpoint " + (notice.endpoint ?? "").toUpperCase();
  const attempt = notice.attempt ?? 1;
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
      {attempt}{" "}
      {t(
        "attempts. Retry it from the delivery log.",
        "tentativi. Puoi riprovarlo dal registro consegne.",
      )}
    </>
  );
}
