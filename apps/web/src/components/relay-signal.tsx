"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { paintSignal, TURN } from "./signal-art";
import styles from "./relay-signal.module.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function RelaySignal() {
  const figure = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const animation = useRef<gsap.core.Tween | null>(null);
  const paused = useRef(false);
  const [isPaused, setPaused] = useState(false);
  const [canAnimate, setCanAnimate] = useState(false);

  useGSAP(
    () => {
      const surface = canvas.current;
      const context = surface?.getContext("2d");
      if (!surface || !context || !figure.current) {
        return;
      }

      const phase = { angle: 0.7 };
      let width = surface.clientWidth;
      let height = surface.clientHeight;
      let visible = true;
      const paint = () =>
        paintSignal(surface, context, width, height, phase.angle);
      const size = new ResizeObserver(([entry]) => {
        if (!entry) {
          return;
        }
        width = entry.contentRect.width;
        height = entry.contentRect.height;
        paint();
      });
      size.observe(surface);
      paint();

      const visibility = new IntersectionObserver(([entry]) => {
        visible = Boolean(entry?.isIntersecting);
        animation.current?.paused(paused.current || !visible);
      });
      visibility.observe(surface);

      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        setCanAnimate(true);
        animation.current = gsap.to(phase, {
          angle: phase.angle + TURN,
          duration: 12,
          ease: "none",
          repeat: -1,
          onUpdate: paint,
          paused: paused.current || !visible,
        });

        animatePage(surface);
        return () => {
          animation.current = null;
          setCanAnimate(false);
        };
      });

      return () => {
        size.disconnect();
        visibility.disconnect();
        media.revert();
      };
    },
    { scope: figure },
  );

  function toggleMotion() {
    const next = !paused.current;
    paused.current = next;
    setPaused(next);
    animation.current?.paused(next);
  }

  return (
    <figure
      ref={figure}
      className={styles.figure}
      aria-label="Animated diagram of webhook routing"
    >
      <canvas ref={canvas} aria-hidden="true" />
      <figcaption className={styles.caption}>
        <span>
          Ingress <span aria-hidden="true">⟶</span> HTTPS delivery
        </span>
        {canAnimate && (
          <button type="button" onClick={toggleMotion}>
            {(isPaused && "Resume animation") || "Pause animation"}
          </button>
        )}
      </figcaption>
    </figure>
  );
}

function animatePage(surface: HTMLCanvasElement) {
  const main = surface.closest("main");
  const title = main?.querySelectorAll("[data-relay-reveal]");
  if (title?.length) {
    gsap
      .timeline()
      .from(title, {
        yPercent: 105,
        duration: 1.05,
        stagger: 0.14,
        ease: "power4.out",
        clearProps: "transform",
      })
      .from(
        surface,
        {
          opacity: 0,
          duration: 1.2,
          clearProps: "opacity",
        },
        0.15,
      );
  }

  const flow = main?.querySelector("[data-relay-flow]");
  if (flow) {
    gsap.from(flow.children, {
      y: 24,
      duration: 0.75,
      stagger: 0.11,
      clearProps: "transform",
      scrollTrigger: { trigger: flow, start: "top 90%", once: true },
    });
  }
}
