"use client";

import { useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const MOTION_QUERY = "(prefers-reduced-motion: no-preference)";
const PENDING_CLASS = "intro-pending";

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
        const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
        intro
          .from(
            "[data-intro=header]",
            { y: -18, autoAlpha: 0, duration: 0.8 },
            0,
          )
          .from(
            "[data-intro=kicker]",
            { y: 10, autoAlpha: 0, duration: 0.6 },
            0.15,
          )
          .from(
            "[data-intro=line]",
            {
              yPercent: 115,
              duration: 1.15,
              stagger: 0.11,
              ease: "power4.out",
            },
            0.2,
          )
          .from(
            "[data-intro=lede]",
            { y: 16, autoAlpha: 0, duration: 0.8 },
            0.75,
          )
          .from(
            "[data-intro=actions] > *",
            { y: 16, autoAlpha: 0, duration: 0.7, stagger: 0.08 },
            0.9,
          )
          .from(
            "[data-intro=console]",
            { y: 22, autoAlpha: 0, duration: 0.9 },
            1.35,
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
