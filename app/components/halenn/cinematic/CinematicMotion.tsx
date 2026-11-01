"use client";

import { type ReactNode, useEffect, useRef } from "react";
import styles from "./cinematic.module.css";

const smooth = (value: number) => {
  const p = Math.max(0, Math.min(1, value));
  return p * p * (3 - 2 * p);
};

// Preserve the hero artwork and contact entrance; service examples use native flow.
export default function CinematicMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current!;
    const find = (selector: string) => element.querySelector<HTMLElement>(selector)!;
    const clearance = find("[data-silk-clearance]");
    const exclusion = element.querySelector<SVGGElement>("[data-silk-exclusion]")!;
    const outlines = element.querySelectorAll<SVGPathElement>("[data-silk-outline]");
    const logo = find("[data-ribbon-art] img");
    const opening = find("[data-opening]");
    const contact = find("#contact");
    const light = find("[data-contact-light]");
    const words = Array.from(element.querySelectorAll<HTMLElement>("[data-contact-word]"));
    const media = matchMedia("(prefers-reduced-motion: no-preference)");
    let pending = 0, hashFrame = 0, contactTop = 0, height = innerHeight;
    const reset = () => {
      [light, ...words].forEach(target => {
        target.style.removeProperty("transform");
        target.style.removeProperty("opacity");
      });
    };
    const paint = () => {
      pending = 0;
      if (!media.matches) return;
      const progress = smooth((scrollY - contactTop + height * .78) / (height * .65));
      words.forEach((word, index) => {
        word.style.transform = `translate3d(${(index ? 1 : -1) * (1 - progress) * 3}vw,${(1 - progress) * 25}px,0)`;
        word.style.opacity = String(.65 + .35 * progress);
      });
      light.style.opacity = String(.4 + .6 * progress);
    };
    const schedule = () => {
      if (!pending && !document.hidden && media.matches) pending = requestAnimationFrame(paint);
    };
    const measure = () => {
      reset();
      height = innerHeight;
      contactTop = contact.getBoundingClientRect().top + scrollY;
      const logoBounds = logo.getBoundingClientRect();
      const openingBounds = opening.getBoundingClientRect();
      exclusion.setAttribute("transform", `translate(${logoBounds.left} ${logoBounds.top - openingBounds.top})`);
      outlines.forEach(outline => outline.setAttribute("transform", `scale(${logoBounds.width / 1536} ${logoBounds.height / 1024})`));
      clearance.setAttribute("data-silk-clearance-ready", "");
      paint();
    };
    measure();
    const anchor = location.hash.slice(1);
    if (["hero-content", "services", "websites", "commerce", "automation", "apps", "projects", "process", "scope", "pricing-intro", "faq", "contact"].includes(anchor)) {
      hashFrame = requestAnimationFrame(() => {
        hashFrame = requestAnimationFrame(() => {
          if (location.hash.slice(1) !== anchor) return;
          if (anchor === "hero-content") window.scrollTo({ top: 0, behavior: "instant" });
          else element.querySelector<HTMLElement>(`#${anchor}`)?.scrollIntoView({ block: "start", behavior: "instant" });
        });
      });
    }
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", measure);
    media.addEventListener("change", measure);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      cancelAnimationFrame(pending);
      cancelAnimationFrame(hashFrame);
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", measure);
      media.removeEventListener("change", measure);
      document.removeEventListener("visibilitychange", schedule);
      clearance.removeAttribute("data-silk-clearance-ready");
      reset();
    };
  }, []);
  return <div ref={root} className={styles.motionRoot}>{children}</div>;
}
