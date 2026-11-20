"use client";

import { useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollToPlugin);

const MOTION_QUERY = "(prefers-reduced-motion: no-preference)";
const PENDING_CLASS = "intro-pending";
const GLIDE_SECONDS = 1.2;

// In-page links glide to their section instead of jumping, then move focus
// there so keyboard and screen reader users land in the same place.
function glideToAnchor(event: MouseEvent) {
  const origin = event.target;
  if (!(origin instanceof Element)) {
    return;
  }
  const link = origin.closest<HTMLAnchorElement>('a[href^="#"]');
  const id = link?.getAttribute("href")?.slice(1);
  if (!id) {
    return;
  }
  const target = document.getElementById(id);
  if (!target) {
    return;
  }
  event.preventDefault();
  gsap.to(window, {
    scrollTo: { y: target, autoKill: true },
    duration: GLIDE_SECONDS,
    ease: "power3.inOut",
    onComplete: () => {
      history.replaceState(null, "", "#" + id);
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    },
  });
}

// Directs the homepage entrance and the scroll reveals below the hero.
export function LandingMotion({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add(MOTION_QUERY, () => {
        const root = scope.current;
        root?.addEventListener("click", glideToAnchor);
        // Explicit end states plus clearProps: every actor ends exactly at
        // its layout position, with no transform left behind.
        const settled = {
          y: 0,
          yPercent: 0,
          autoAlpha: 1,
          clearProps: "transform,opacity,visibility",
        };
        const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
        intro
          .fromTo(
            "[data-intro=header]",
            { y: -18, autoAlpha: 0 },
            { ...settled, duration: 0.8 },
            0,
          )
          .fromTo(
            "[data-intro=line]",
            { yPercent: 115 },
            { ...settled, duration: 1.15, stagger: 0.11, ease: "power4.out" },
            0.2,
          )
          .fromTo(
            "[data-intro=lede]",
            { y: 16, autoAlpha: 0 },
            { ...settled, duration: 0.8 },
            0.75,
          )
          .fromTo(
            "[data-intro=case]",
            { x: -10, autoAlpha: 0 },
            {
              x: 0,
              autoAlpha: 1,
              duration: 0.5,
              clearProps: "transform,opacity,visibility",
            },
            0.65,
          )
          .fromTo(
            "[data-intro=actions] > *",
            { y: 16, autoAlpha: 0 },
            { ...settled, duration: 0.7, stagger: 0.08 },
            0.9,
          );
        document.documentElement.classList.remove(PENDING_CLASS);

        for (const element of gsap.utils.toArray<HTMLElement>(
          "[data-reveal]",
        )) {
          gsap.from(element, {
            y: 34,
            autoAlpha: 0,
            duration: 1,
            ease: "power3.out",
            scrollTrigger: { trigger: element, start: "top 86%", once: true },
          });
        }
        for (const list of gsap.utils.toArray<HTMLElement>(
          "[data-reveal-list]",
        )) {
          gsap.from(list.children, {
            y: 22,
            autoAlpha: 0,
            duration: 0.8,
            stagger: 0.07,
            ease: "power3.out",
            scrollTrigger: { trigger: list, start: "top 82%", once: true },
          });
        }
        return () => {
          root?.removeEventListener("click", glideToAnchor);
        };
      });
      // Reduced motion: nothing is hidden, so release the pending state now.
      document.documentElement.classList.remove(PENDING_CLASS);
      return () => media.revert();
    },
    { scope },
  );

  return (
    <div ref={scope} className={className}>
      {children}
    </div>
  );
}
