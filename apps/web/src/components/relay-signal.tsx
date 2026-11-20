"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import styles from "./relay-signal.module.css";

gsap.registerPlugin(useGSAP);

const TURN = 2 * Math.PI;
const RINGS = 9;
const MARKS = 75;
const PARTICLES = 20;

export function RelaySignal() {
  const scope = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const animation = useRef<gsap.core.Tween | null>(null);
  const paused = useRef(false);
  const [isPaused, setPaused] = useState(false);
  const [canAnimate, setCanAnimate] = useState(false);

  useGSAP(
    () => {
      const surface = canvas.current;
      const context = surface?.getContext("2d");
      if (!surface || !context) {
        return;
      }
      const phase = { angle: 0.85 };
      const paint = () => drawSignal(surface, context, phase.angle);
      const observer = new ResizeObserver(paint);
      observer.observe(surface);
      paint();
      const media = gsap.matchMedia();
      media.add(
        {
          motion: "(prefers-reduced-motion: no-preference)",
          reduced: "(prefers-reduced-motion: reduce)",
        },
        ({ conditions }) => {
          const enabled = Boolean(conditions?.motion);
          setCanAnimate(enabled);
          if (!enabled) {
            paint();
            return;
          }
          animation.current = gsap.to(phase, {
            angle: phase.angle + TURN,
            duration: 14,
            ease: "none",
            repeat: -1,
            onUpdate: paint,
            paused: paused.current,
          });
          return () => {
            animation.current = null;
          };
        },
      );
      return () => {
        observer.disconnect();
        media.revert();
      };
    },
    { scope },
  );

  function toggleMotion() {
    const next = !paused.current;
    paused.current = next;
    setPaused(next);
    animation.current?.paused(next);
  }

  return (
    <figure
      ref={scope}
      className={styles.figure}
      aria-label="Animated diagram of webhook routing"
    >
      <div className={styles.stage}>
        <canvas ref={canvas} aria-hidden="true" />
        <span className={styles.ingress}>Signed ingress</span>
        <span className={styles.egress}>HTTPS delivery</span>
      </div>
      <figcaption className={styles.caption}>
        <span>
          Receive <span aria-hidden="true">→</span> Route{" "}
          <span aria-hidden="true">→</span> Deliver
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

function drawSignal(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  angle: number,
) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) {
    return;
  }
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelsWide = Math.round(width * ratio);
  const pixelsHigh = Math.round(height * ratio);
  if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh) {
    canvas.width = pixelsWide;
    canvas.height = pixelsHigh;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const centerX = width * 0.5;
  const centerY = height * 0.48;
  const radius = Math.min(width, height) * 0.26;
  drawOrbit(context, centerX, centerY, radius, angle);
  drawFlow(context, centerX, centerY, radius, angle);
}

function drawOrbit(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  angle: number,
) {
  const roll = angle;
  const horizontal = Math.cos(roll);
  const vertical = Math.sin(roll);
  for (let ring = 0; ring < RINGS; ring += 1) {
    const tilt = (ring * Math.PI) / RINGS + angle;
    context.beginPath();
    for (let mark = 0; mark <= MARKS; mark += 1) {
      const position = (mark * TURN) / MARKS;
      const depth = Math.sin(position) * Math.sin(tilt);
      const perspective = 1 + depth * 0.24;
      const localX = radius * Math.cos(position) * perspective;
      const localY = radius * Math.sin(position) * Math.cos(tilt) * perspective;
      const pointX = x + localX * horizontal - localY * vertical;
      const pointY = y + localX * vertical + localY * horizontal;
      if (mark === 0) {
        context.moveTo(pointX, pointY);
      } else {
        context.lineTo(pointX, pointY);
      }
    }
    context.strokeStyle = "rgba(109, 231, 250, " + (0.13 + ring * 0.045) + ")";
    context.lineWidth = 1.25;
    context.stroke();
  }
}

function drawFlow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  angle: number,
) {
  const extent = radius * 1.8;
  context.save();
  context.shadowBlur = 13;
  context.shadowColor = "#68e9ff";
  for (let index = 0; index < PARTICLES; index += 1) {
    const position = ((angle / TURN) * 3 + index / PARTICLES) % 1;
    const offset = (position - 0.5) * extent * 2;
    const wave =
      Math.sin(position * TURN * 1.5 + angle + (index % 3)) * radius * 0.34;
    const opacity = Math.sin(Math.PI * position) * 0.8 + 0.15;
    context.fillStyle = "rgba(147, 239, 255, " + opacity + ")";
    context.beginPath();
    context.arc(x + offset, y + wave, 2 + (index % 3), 0, TURN);
    context.fill();
  }
  context.restore();
}
