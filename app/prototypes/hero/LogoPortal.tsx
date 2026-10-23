"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { Arrow } from "./Shared";
import s from "./cinematic.module.css";

/** The original image stays still. Only its surrounding light responds. */
export default function LogoPortal({ children }: { children: ReactNode }) {
  const light = useRef<HTMLSpanElement>(null);
  const bounds = useRef<DOMRect | null>(null);
  const pointerMotion = useRef<MediaQueryList | null>(null);
  useEffect(() => {
    const media = matchMedia(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    );
    pointerMotion.current = media;
    const reset = () => light.current?.style.removeProperty("transform");
    media.addEventListener("change", reset);
    return () => media.removeEventListener("change", reset);
  }, []);
  return (
    <a
      href="#services"
      className={s.logoPortal}
      aria-label="Explore Halenn’s services"
      onPointerEnter={(event) => {
        bounds.current = event.currentTarget.getBoundingClientRect();
      }}
      onPointerMove={(event) => {
        if (
          !light.current ||
          !bounds.current ||
          !pointerMotion.current?.matches
        )
          return;
        const box = bounds.current;
        const x = Math.max(
          -1,
          Math.min(1, ((event.clientX - box.left) / box.width) * 2 - 1),
        );
        const y = Math.max(
          -1,
          Math.min(1, ((event.clientY - box.top) / box.height) * 2 - 1),
        );
        light.current.style.transform = `translate3d(${x * 70}px, ${y * 35}px, 0)`;
      }}
      onPointerLeave={() => {
        light.current?.style.removeProperty("transform");
        bounds.current = null;
      }}
      onClick={(event) => {
        const scene = document.querySelector<HTMLElement>(
          "[data-scroll-scene]",
        );
        const stage = document.querySelector<HTMLElement>(
          "[data-scroll-stage]",
        );
        if (
          !scene ||
          !stage ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        const animated = scene.closest("[data-cinematic-motion]");
        const top = scene.getBoundingClientRect().top + scrollY;
        const destination =
          top +
          (animated
            ? Math.max(0, scene.offsetHeight - stage.offsetHeight) * 0.78
            : 0);
        history.replaceState(null, "", "#services");
        // Keyboard and reduced-motion activation remain immediate.
        window.scrollTo({
          top: destination,
          behavior:
            event.detail === 0 ||
            matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "instant"
              : "smooth",
        });
        scene.focus({ preventScroll: true });
      }}
    >
      <span ref={light} className={s.portalLight} aria-hidden="true" />
      {children}
      <span className={s.portalHint} aria-hidden="true">
        Explore the experience <Arrow down />
      </span>
    </a>
  );
}
