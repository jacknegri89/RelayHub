"use client";

import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollToPlugin);

const MOTION_QUERY = "(prefers-reduced-motion: no-preference)";
const PENDING_CLASS = "intro-pending";
const GLIDE_SECONDS = 1.2;

// In-page links glide to their section instead of jumping, then move focus
// there so keyboard and screen reader users land in the same place.
function glideToAnchor(event: MouseEvent) {
  if (
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey ||
    event.defaultPrevented
  ) {
    return;
  }
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

// Limits the entrance animation to the homepage introduction.
export function LandingMotion({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const scope = useRef<HTMLDivElement>(null);

  // Keep previously shared links to the two sections moved to the public guide.
  useEffect(() => {
    function followGuideBookmark() {
      const hash = window.location.hash;
      if (hash === "#journey" || hash === "#ledger-title") {
        window.location.replace("/guide" + hash);
      }
    }
    followGuideBookmark();
    window.addEventListener("hashchange", followGuideBookmark);
    return () => window.removeEventListener("hashchange", followGuideBookmark);
  }, []);

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
            "[data-intro=actions] > *",
            { y: 16, autoAlpha: 0 },
            { ...settled, duration: 0.7, stagger: 0.08 },
            0.9,
          );
        document.documentElement.classList.remove(PENDING_CLASS);

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
