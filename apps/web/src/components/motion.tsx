"use client";

import { useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

type MotionKind = "heading" | "signal" | "timeline" | "notice";
const MOTION_ALLOWED = "(prefers-reduced-motion: no-preference)";

export function Motion({
  kind,
  className,
  children,
}: {
  kind: MotionKind;
  className?: string;
  children: ReactNode;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useGSAP(
    () => {
      const element = scope.current;
      if (!element) {
        return;
      }
      const media = gsap.matchMedia();
      media.add(
        MOTION_ALLOWED,
        () => {
          if (kind === "signal") {
            animateSignal(element);
            return;
          }
          if (kind === "timeline") {
            const entries = Array.from(
              element.querySelectorAll(".timeline > li"),
            ).slice(0, 5);
            if (entries.length) {
              gsap.from(entries, {
                y: 6,
                duration: 0.32,
                stagger: 0.045,
                ease: "power2.out",
                clearProps: "transform",
              });
            }
            return;
          }
          let distance = 7;
          if (kind === "notice") {
            distance = 4;
          }
          gsap.from(element, {
            y: distance,
            duration: 0.32,
            ease: "power2.out",
            clearProps: "transform",
          });
        },
        element,
      );
      return () => media.revert();
    },
    { scope, dependencies: [kind, pathname], revertOnUpdate: true },
  );

  return (
    <div ref={scope} className={className}>
      {children}
    </div>
  );
}

function animateSignal(element: HTMLDivElement) {
  const traces = element.querySelectorAll("[data-trace]");
  const joints = element.querySelectorAll("[data-joint]");
  const packet = element.querySelector<HTMLElement>("[data-packet]");
  const packetTrack = packet?.parentElement;
  const timeline = gsap.timeline({ defaults: { ease: "power2.out" } });
  if (traces.length) {
    timeline.from(
      traces,
      { scaleX: 0, duration: 0.46, stagger: 0.1, clearProps: "transform" },
      0,
    );
  }
  if (joints.length) {
    timeline.from(
      joints,
      {
        scale: 0.72,
        opacity: 0.65,
        duration: 0.27,
        stagger: 0.09,
        clearProps: "opacity,transform",
      },
      0.14,
    );
  }
  if (packet && packetTrack) {
    const distance = Math.max(0, packetTrack.clientWidth - packet.offsetWidth);
    if (distance > 0) {
      timeline
        .set(packet, { opacity: 1 }, 0.13)
        .to(packet, { x: distance, duration: 0.55, ease: "power1.inOut" }, 0.13)
        .to(packet, {
          opacity: 0,
          duration: 0.12,
          clearProps: "transform,opacity",
        });
    }
  }
}
