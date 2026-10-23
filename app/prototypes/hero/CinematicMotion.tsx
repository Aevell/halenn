"use client";

import { type ReactNode, useEffect, useRef } from "react";
import styles from "./cinematic.module.css";

const clamp = (value: number) => Math.max(0, Math.min(1, value));

// Native scrolling stays in charge. React never renders on a scroll frame.
export default function CinematicMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const scene = element.querySelector<HTMLElement>("[data-scroll-scene]");
    const stage = element.querySelector<HTMLElement>("[data-scroll-stage]");
    const frame = element.querySelector<HTMLElement>("[data-expanding-frame]");
    const type = element.querySelector<HTMLElement>("[data-scene-type]");
    const progress = element.querySelector<HTMLElement>("[data-scroll-progress]");
    const copy = element.querySelector<HTMLElement>("[data-hero-copy]");
    const asides = element.querySelectorAll<HTMLElement>("[data-hero-aside]");
    if (!scene || !stage || !frame || !type || !progress || !copy) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compact = window.matchMedia("(max-height: 680px), (min-width: 601px) and (max-width: 1000px)");
    let top = 0;
    let range = 1;
    let height = 1;
    let pending = 0;
    let active = true;
    const reset = () => {
      frame.style.removeProperty("transform");
      type.style.removeProperty("transform");
      type.style.removeProperty("opacity");
      copy.style.removeProperty("transform");
      copy.style.removeProperty("opacity");
      asides.forEach((aside) => aside.style.removeProperty("opacity"));
      progress.style.removeProperty("transform");
    };
    const paint = () => {
      pending = 0;
      if (!active) return;
      const y = window.scrollY;
      const position = clamp((y - top) / range);
      // Expansion ends before unpinning, leaving time to read at full size.
      const expansion = clamp(position / .78);
      frame.style.transform = `scale(${.46 + .54 * expansion})`;
      type.style.transform = `translate3d(${-expansion * 7}%, 0, 0)`;
      type.style.opacity = String(1 - expansion);
      progress.style.transform = `scaleX(${position})`;
      const departure = clamp(y / height);
      copy.style.transform = `translate3d(0, ${-departure * 80}px, 0)`;
      copy.style.opacity = String(1 - departure);
      asides.forEach((aside) => { aside.style.opacity = String(1 - departure); });
    };
    const requestPaint = () => { if (!pending && active) pending = requestAnimationFrame(paint); };
    const measure = () => {
      active = !reduced.matches && !compact.matches;
      element.toggleAttribute("data-cinematic-motion", active);
      reset();
      height = stage.offsetHeight;
      top = scene.getBoundingClientRect().top + window.scrollY;
      range = Math.max(1, scene.offsetHeight - height);
      if (active) paint();
    };
    measure();
    window.addEventListener("scroll", requestPaint, { passive: true });
    window.addEventListener("resize", measure);
    reduced.addEventListener("change", measure);
    compact.addEventListener("change", measure);
    const resize = new ResizeObserver(measure);
    resize.observe(stage);
    // Keyboard focus must never land inside a visually miniaturised scene.
    const revealFocusedFrame = (event: FocusEvent) => {
      if (!active || !(event.target instanceof Node) || !frame.contains(event.target)) return;
      if (window.scrollY < top + range * .78) window.scrollTo({ top: top + range * .78, behavior: "instant" });
    };
    frame.addEventListener("focusin", revealFocusedFrame);
    return () => {
      cancelAnimationFrame(pending);
      resize.disconnect();
      window.removeEventListener("scroll", requestPaint);
      window.removeEventListener("resize", measure);
      reduced.removeEventListener("change", measure);
      compact.removeEventListener("change", measure);
      frame.removeEventListener("focusin", revealFocusedFrame);
    };
  }, []);

  return <div ref={root} className={styles.motionRoot}>{children}</div>;
}
