"use client";

import { useEffect, useRef } from "react";
import Silk from "../halenn/cinematic/Silk";
import s from "./pricing.module.css";

export function PricingAtmosphere({ scene }: { scene: "intro" | "guide" | "contact" }) {
  return <div className={`${s.atmosphere} ${s[`${scene}Atmosphere`]}`} data-pricing-atmosphere data-silk-scene aria-hidden="true">
    <div className={s.atmosphereFold}><Silk sizes="(max-width:700px) 200vw, 120vw" eager={scene === "intro"} /></div>
  </div>;
}

export function PricingMotion() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const page = marker.current!.parentElement!;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const layers = Array.from(page.querySelectorAll<HTMLElement>("[data-pricing-atmosphere]"));
    const active = new Set<HTMLElement>();
    let frame = 0;
    const paint = () => {
      frame = 0;
      if (motion.matches || document.hidden) return;
      const range = innerWidth <= 700 ? 16 : 40;
      active.forEach((layer) => {
        const bounds = layer.parentElement!.getBoundingClientRect();
        const progress = Math.max(0, Math.min(1, (innerHeight - bounds.top) / (innerHeight + bounds.height)));
        layer.style.setProperty("--silk-depth", `${(progress - 0.5) * range}px`);
      });
    };
    const schedule = () => {
      if (!frame && active.size && !motion.matches && !document.hidden) frame = requestAnimationFrame(paint);
    };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        const element = target as HTMLElement;
        if (isIntersecting) active.add(element); else active.delete(element);
      });
      schedule();
    });
    layers.forEach((layer) => observer.observe(layer));
    const guide = page.querySelector<HTMLElement>("[data-guide-entrance]");
    let entrance: Animation | undefined;
    const reveal = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || !guide) return;
      if (!motion.matches) entrance = guide.animate([
        { opacity: 0.55, transform: "translateY(20px)", clipPath: "inset(0 0 8% 0)" },
        { opacity: 1, transform: "translateY(0)", clipPath: "inset(0)" },
      ], { duration: 500, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
      reveal.disconnect();
    }, { threshold: 0.18 });
    if (guide) reveal.observe(guide);
    const preferences = () => {
      if (motion.matches) {
        entrance?.cancel();
        layers.forEach((layer) => layer.style.removeProperty("--silk-depth"));
      }
      schedule();
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("visibilitychange", schedule);
    motion.addEventListener("change", preferences);
    return () => {
      cancelAnimationFrame(frame);
      entrance?.cancel();
      observer.disconnect();
      reveal.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("visibilitychange", schedule);
      motion.removeEventListener("change", preferences);
    };
  }, []);
  return <span ref={marker} hidden />;
}
