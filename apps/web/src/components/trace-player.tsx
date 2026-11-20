"use client";

import { useRef, type ReactNode } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

const MOTION_QUERY = "(prefers-reduced-motion: no-preference)";
const STATIC_QUERY = "(prefers-reduced-motion: reduce)";
const MAX_STEP_SECONDS = 0.55;
const TOTAL_BUDGET_SECONDS = 3.6;

type Timeline = ReturnType<typeof gsap.timeline>;

function readPoint(value: string | undefined) {
  const [x, y] = (value ?? "0,0").split(",");
  return { x: Number(x), y: Number(y) };
}

// On narrow screens the trace scrolls sideways: keep the photon in view.
function followPhoton(root: HTMLElement, photon: SVGCircleElement) {
  const scroller = root.querySelector<HTMLElement>(".trace-scroll");
  if (!scroller || scroller.scrollWidth <= scroller.clientWidth) {
    return;
  }
  const photonBox = photon.getBoundingClientRect();
  const scrollerBox = scroller.getBoundingClientRect();
  const offset = photonBox.left - scrollerBox.left - scroller.clientWidth / 2;
  scroller.scrollLeft += offset;
}

// Center the final label itself; the SVG tail includes room for translated text.
function revealOutcome(root: HTMLElement) {
  const scroller = root.querySelector<HTMLElement>(".trace-scroll");
  if (!scroller || scroller.scrollWidth <= scroller.clientWidth) {
    return;
  }
  const labels = scroller.querySelectorAll<SVGTextElement>("text[data-step]");
  const label = labels.item(labels.length - 1);
  if (label) {
    const bounds = label.getBoundingClientRect();
    const inset = Math.max(0, (scroller.clientWidth - bounds.width) / 2);
    scroller.scrollLeft +=
      bounds.left - scroller.getBoundingClientRect().left - inset;
  }
}

// Replays a server-rendered trace in order. Elements opt in with data-step:
// segments are drawn (and followed by a photon), marks pop in, flashes ripple.
function buildTimeline(root: HTMLElement) {
  const steps = new Map<number, HTMLElement[]>();
  for (const element of root.querySelectorAll<HTMLElement>("[data-step]")) {
    const step = Number(element.dataset.step);
    const group = steps.get(step) ?? [];
    group.push(element);
    steps.set(step, group);
  }
  const order = [...steps.keys()].sort((left, right) => left - right);
  const stepSeconds = Math.min(
    MAX_STEP_SECONDS,
    TOTAL_BUDGET_SECONDS / Math.max(order.length, 1),
  );
  const photon = root.querySelector<SVGCircleElement>(".photon-head");
  const timeline: Timeline = gsap.timeline({ delay: 0.15 });

  for (const element of root.querySelectorAll<HTMLElement>("[data-step]")) {
    if (element.hasAttribute("data-segment")) {
      gsap.set(element, { strokeDashoffset: 1 });
    } else {
      gsap.set(element, { autoAlpha: 0 });
    }
  }

  order.forEach((step, index) => {
    const at = index * stepSeconds;
    for (const element of steps.get(step) ?? []) {
      if (element.hasAttribute("data-segment")) {
        timeline.to(
          element,
          // autoRound: false keeps the 0..1 dash offset from snapping to whole pixels.
          {
            strokeDashoffset: 0,
            autoRound: false,
            duration: stepSeconds,
            ease: "none",
          },
          at,
        );
        if (photon && element.dataset.from && element.dataset.to) {
          const from = readPoint(element.dataset.from);
          const to = readPoint(element.dataset.to);
          timeline
            .set(photon, { attr: { cx: from.x, cy: from.y }, autoAlpha: 1 }, at)
            .to(
              photon,
              {
                attr: { cx: to.x, cy: to.y },
                duration: stepSeconds,
                ease: "none",
                onUpdate: () => followPhoton(root, photon),
              },
              at,
            );
        }
        continue;
      }
      if (element.hasAttribute("data-flash")) {
        timeline.fromTo(
          element,
          { autoAlpha: 0.9, scale: 0.3, transformOrigin: "50% 50%" },
          { autoAlpha: 0, scale: 2.4, duration: 0.7, ease: "power2.out" },
          at,
        );
        continue;
      }
      timeline.fromTo(
        element,
        { autoAlpha: 0, scale: 0.4, transformOrigin: "50% 50%" },
        { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(2.2)" },
        at,
      );
    }
  });
  if (photon) {
    timeline.to(photon, { autoAlpha: 0, duration: 0.2 });
  }
  timeline.eventCallback("onComplete", () => revealOutcome(root));
  return timeline;
}

export function TracePlayer({
  className,
  replayLabel,
  heading,
  children,
}: {
  className?: string;
  replayLabel?: string;
  heading?: ReactNode;
  children: ReactNode;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const timeline = useRef<Timeline | null>(null);

  useGSAP(
    () => {
      const root = scope.current;
      if (!root) {
        return;
      }
      const media = gsap.matchMedia();
      media.add(MOTION_QUERY, () => {
        timeline.current = buildTimeline(root);
        return () => {
          timeline.current = null;
        };
      });
      media.add(STATIC_QUERY, () => {
        revealOutcome(root);
      });
      return () => media.revert();
    },
    { scope, dependencies: [children], revertOnUpdate: true },
  );

  function replay() {
    timeline.current?.restart(true);
  }

  return (
    <div ref={scope} className={className}>
      {(heading || replayLabel) && (
        <div className="trace-head">
          {heading}
          {replayLabel && (
            <button type="button" onClick={replay}>
              ↺ {replayLabel}
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
