"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { paintSignal, TURN } from "./signal-art";
import styles from "./relay-signal.module.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const INTRO_SECONDS = 4.5;

export function RelaySignal() {
  const figure = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useGSAP(
    () => {
      const surface = canvas.current;
      const context = surface?.getContext("2d");
      if (!surface || !context) {
        return;
      }
      const phase = { angle: 0.7, offset: 0 };
      let width = surface.clientWidth;
      let height = surface.clientHeight;
      const paint = () =>
        paintSignal(
          surface,
          context,
          width,
          height,
          phase.angle + phase.offset,
        );
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

      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.to(phase, {
          angle: phase.angle + TURN * 0.66,
          duration: INTRO_SECONDS,
          ease: "power2.out",
          onUpdate: paint,
        });
        const moveSignal = gsap.quickTo(phase, "offset", {
          duration: 0.5,
          ease: "power3.out",
          onUpdate: paint,
        });

        const followPointer = (event: PointerEvent) => {
          if (event.pointerType !== "mouse" && event.pointerType !== "pen") {
            return;
          }
          const bounds = surface.getBoundingClientRect();
          moveSignal(
            ((event.clientX - bounds.left) / bounds.width - 0.5) * TURN * 0.7,
          );
        };

        function centerSignal() {
          moveSignal(0);
        }

        surface.addEventListener("pointermove", followPointer);
        surface.addEventListener("pointerleave", centerSignal);
        animatePage(surface);
        return () => {
          surface.removeEventListener("pointermove", followPointer);
          surface.removeEventListener("pointerleave", centerSignal);
        };
      });

      return () => {
        size.disconnect();
        media.revert();
      };
    },
    { scope: figure },
  );

  return (
    <figure
      ref={figure}
      className={styles.figure}
      aria-label="Animated diagram of webhook routing"
    >
      <canvas ref={canvas} aria-hidden="true" />
      <figcaption className={styles.caption}>
        <span>Signed ingress</span>
        <span aria-hidden="true" />
        <span>HTTPS delivery</span>
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
          scale: 0.94,
          duration: 1.18,
          ease: "power2.out",
          clearProps: "opacity,transform",
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
