"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useLocale } from "./locale";
import styles from "./journey-story.module.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const STAGE_COUNT = 4;
const MOTION_QUERY = "(prefers-reduced-motion: no-preference)";

// Lane positions on the story diagram. Time runs upward, signals travel at 45°.
const SENDER_X = 34;
const RELAY_X = 124;
const ENDPOINT_A_X = 200;
const ENDPOINT_B_X = 244;

export function JourneyStory() {
  const { t } = useLocale();
  const scope = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const section = scope.current;
      if (!section) {
        return;
      }
      const media = gsap.matchMedia();
      media.add(MOTION_QUERY, () => {
        const groups = gsap.utils.toArray<SVGGElement>("[data-stage]", section);
        const chapters = gsap.utils.toArray<HTMLElement>(
          "[data-chapter]",
          section,
        );
        gsap.set(groups, { autoAlpha: 0 });
        gsap.set(section.querySelectorAll("[data-draw]"), {
          strokeDashoffset: 1,
        });

        function showStage(stage: number) {
          section?.setAttribute("data-active-stage", String(stage));
          for (const group of groups) {
            const groupStage = Number(group.dataset.stage);
            const lines = group.querySelectorAll("[data-draw]");
            const marks = group.querySelectorAll("[data-mark]");
            if (groupStage > stage) {
              gsap.to(group, { autoAlpha: 0, duration: 0.3, overwrite: true });
              gsap.to(lines, {
                strokeDashoffset: 1,
                autoRound: false,
                duration: 0.3,
                overwrite: true,
              });
              continue;
            }
            // Earlier stages stay drawn but dim; only the current one animates.
            if (groupStage < stage) {
              gsap.to(group, {
                autoAlpha: 0.42,
                duration: 0.4,
                overwrite: true,
              });
              gsap.set(lines, { strokeDashoffset: 0 });
              continue;
            }
            gsap.to(group, { autoAlpha: 1, duration: 0.4, overwrite: true });
            // autoRound: false keeps the 0..1 dash offset from snapping to whole pixels.
            gsap.to(lines, {
              strokeDashoffset: 0,
              autoRound: false,
              duration: 0.9,
              stagger: 0.35,
              ease: "power2.inOut",
              overwrite: true,
            });
            gsap.fromTo(
              marks,
              { scale: 0.4, transformOrigin: "50% 50%" },
              {
                scale: 1,
                duration: 0.5,
                stagger: 0.35,
                delay: 0.55,
                ease: "back.out(2.4)",
                overwrite: true,
              },
            );
          }
        }

        chapters.forEach((chapter, index) => {
          ScrollTrigger.create({
            trigger: chapter,
            start: "top 62%",
            end: "bottom 62%",
            onToggle: (trigger) => {
              if (trigger.isActive) {
                showStage(index + 1);
              }
            },
          });
        });
        ScrollTrigger.create({
          trigger: section,
          start: "top 70%",
          onLeaveBack: () => showStage(0),
        });
      });
      return () => media.revert();
    },
    { scope },
  );

  const chapters = [
    {
      key: "signed",
      label: "01",
      title: t("Signed at the source", "Firmato alla sorgente"),
      body: t(
        "The sender signs the timestamp and raw body with HMAC-SHA256. RelayHub recomputes the signature, compares it in constant time and refuses requests outside a five-minute window.",
        "Il mittente firma timestamp e corpo grezzo con HMAC-SHA256. RelayHub ricalcola la firma, la confronta a tempo costante e rifiuta le richieste fuori da una finestra di cinque minuti.",
      ),
    },
    {
      key: "accepted",
      label: "02",
      title: t("Accepted exactly once", "Accettato una sola volta"),
      body: t(
        "The encrypted event, its delivery records and outbox entries commit together in one PostgreSQL transaction. A repeated event ID from the same source is acknowledged, not duplicated.",
        "L’evento cifrato, le sue consegne e le voci di outbox vengono salvati insieme in un’unica transazione PostgreSQL. Se la stessa sorgente ripete un ID evento, RelayHub lo conferma senza duplicarlo.",
      ),
    },
    {
      key: "routed",
      label: "03",
      title: t("Routed inside the cone", "Instradato nel cono"),
      body: t(
        "Routes match the source and event type, so one event can fan out to several endpoints. Each delivery gets its own stable ID for the receiver to deduplicate.",
        "Le regole confrontano sorgente e tipo di evento, così un evento può raggiungere più endpoint. Ogni consegna ha un ID stabile che il destinatario può usare per evitare duplicati.",
      ),
    },
    {
      key: "retried",
      label: "04",
      title: t("Delivered, or retried", "Consegnato, o ritentato"),
      body: t(
        "A worker signs the outgoing request. A 2xx closes the delivery; a 429 or 5xx bounces back and waits, doubling the pause each time. Every attempt stays on the record.",
        "Un worker firma la richiesta in uscita. Un 2xx chiude la consegna; un 429 o un 5xx rimbalza e attende, raddoppiando la pausa a ogni giro. Ogni tentativo resta registrato.",
      ),
    },
  ];

  return (
    <section
      ref={scope}
      id="journey"
      className={styles.story}
      aria-labelledby="journey-title"
      data-active-stage={STAGE_COUNT}
    >
      <header className={styles.heading} data-reveal>
        <p className={styles.eyebrow}>
          {t("The life of one event", "La vita di un evento")}
        </p>
        <h2 id="journey-title">
          {t(
            "Four moments, one line through time.",
            "Quattro momenti, una sola linea nel tempo.",
          )}
        </h2>
      </header>
      <div className={styles.layout}>
        <figure className={styles.figure}>
          <svg
            viewBox="0 0 320 572"
            role="img"
            aria-label={t(
              "Spacetime diagram of one event: signed, accepted, routed to two endpoints, one delivery bounced and retried.",
              "Diagramma spazio-tempo di un evento: firmato, accettato, instradato a due endpoint, una consegna respinta e ritentata.",
            )}
          >
            <g className={styles.lanes}>
              <line x1={SENDER_X} y1="548" x2={SENDER_X} y2="20" />
              <line x1={ENDPOINT_A_X} y1="548" x2={ENDPOINT_A_X} y2="20" />
              <line x1={ENDPOINT_B_X} y1="548" x2={ENDPOINT_B_X} y2="20" />
              <line
                className={styles.horizon}
                x1={RELAY_X - 2}
                y1="548"
                x2={RELAY_X - 2}
                y2="20"
              />
              <line
                className={styles.horizon}
                x1={RELAY_X + 2}
                y1="548"
                x2={RELAY_X + 2}
                y2="20"
              />
              <text x={SENDER_X} y="566">
                {t("SENDER", "MITTENTE")}
              </text>
              <text x={RELAY_X} y="566">
                RELAYHUB
              </text>
              <text x={ENDPOINT_A_X} y="566">
                A
              </text>
              <text x={ENDPOINT_B_X} y="566">
                B
              </text>
              <text className={styles.axis} x="300" y="34">
                {t("time ↑", "tempo ↑")}
              </text>
            </g>

            <g data-stage="1" className={styles.stage}>
              <path
                data-draw
                pathLength={1}
                className={styles.ingress}
                d={`M${SENDER_X} 530 L${RELAY_X} 440`}
              />
              <g data-mark>
                <circle className={styles.seal} cx={RELAY_X} cy="440" r="9" />
                <text className={styles.note} x={RELAY_X + 14} y="452">
                  HMAC v1 ✓
                </text>
              </g>
            </g>

            <g data-stage="2" className={styles.stage}>
              <path
                data-draw
                pathLength={1}
                className={styles.duplicate}
                d={`M${SENDER_X} 498 L${RELAY_X} 408`}
              />
              <g data-mark>
                <rect
                  className={styles.record}
                  x={RELAY_X - 20}
                  y="458"
                  width="12"
                  height="12"
                />
                <text className={styles.note} x={RELAY_X + 14} y="410">
                  {t("same ID · 200 duplicate", "stesso ID · 200 duplicato")}
                </text>
              </g>
            </g>

            <g data-stage="3" className={styles.stage}>
              <path
                className={styles.cone}
                d={`M${RELAY_X} 440 L${SENDER_X} 350 L${SENDER_X} 20 L290 20 L290 274 Z`}
              />
              <path
                data-draw
                pathLength={1}
                className={styles.photon}
                d={`M${RELAY_X} 440 L${ENDPOINT_A_X} 364`}
              />
              <path
                data-draw
                pathLength={1}
                className={styles.photon}
                d={`M${RELAY_X} 440 L${ENDPOINT_B_X} 320`}
              />
            </g>

            <g data-stage="4" className={styles.stage}>
              <g data-mark>
                <circle
                  className={styles.absorbed}
                  cx={ENDPOINT_A_X}
                  cy="364"
                  r="6"
                />
                <text
                  className={styles.noteDelivered}
                  x={ENDPOINT_A_X - 10}
                  y="382"
                  textAnchor="end"
                >
                  204
                </text>
              </g>
              <g data-mark>
                <rect
                  className={styles.failedMark}
                  x={ENDPOINT_B_X - 4}
                  y="316"
                  width="8"
                  height="8"
                />
                <text
                  className={styles.noteFailed}
                  x={ENDPOINT_B_X + 10}
                  y="324"
                >
                  503
                </text>
              </g>
              <path
                data-draw
                pathLength={1}
                className={styles.reflection}
                d={`M${ENDPOINT_B_X} 320 L${RELAY_X} 200`}
              />
              <path
                data-draw
                pathLength={1}
                className={styles.backoff}
                d={`M${RELAY_X + 6} 200 L${RELAY_X + 6} 150`}
              />
              <g data-mark>
                <text
                  className={styles.noteRetry}
                  x={RELAY_X - 10}
                  y="180"
                  textAnchor="end"
                >
                  {t("wait 1 s", "attesa 1 s")}
                </text>
              </g>
              <path
                data-draw
                pathLength={1}
                className={styles.photon}
                d={`M${RELAY_X} 150 L${ENDPOINT_B_X} 30`}
              />
              <g data-mark>
                <circle
                  className={styles.absorbed}
                  cx={ENDPOINT_B_X}
                  cy="30"
                  r="6"
                />
                <text
                  className={styles.noteDelivered}
                  x={ENDPOINT_B_X - 10}
                  y="26"
                  textAnchor="end"
                >
                  {t("204 · attempt 2", "204 · tentativo 2")}
                </text>
              </g>
            </g>
          </svg>
        </figure>
        <ol className={styles.chapters}>
          {chapters.map((chapter) => (
            <li key={chapter.key} data-chapter>
              <span className={styles.chapterLabel}>{chapter.label}</span>
              <h3>{chapter.title}</h3>
              <p>{chapter.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
