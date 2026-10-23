"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { Arrow } from "./Brand";
import s from "./cinematic.module.css";

/** The original image stays still. Only its surrounding light responds. */
export default function LogoPortal({ children }: { children: ReactNode }) {
  const portal = useRef<HTMLAnchorElement>(null);
  const glow = useRef<HTMLSpanElement>(null);
  const light = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const anchor = portal.current;
    const source = light.current;
    const halo = glow.current;
    const opening = anchor?.closest("[data-opening]");
    if (!anchor || !source || !halo || !opening) return;
    const media = matchMedia(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    );
    let visible = false;
    let frame = 0;
    let dirty = true;
    let box = anchor.getBoundingClientRect();
    let point = { x: 0, y: 0 };
    const invalidate = () => { dirty = true; };
    const paint = () => {
      frame = 0;
      if (dirty) {
        box = anchor.getBoundingClientRect();
        dirty = false;
      }
      // The whole viewport steers the source, including space far from the mark.
      const x = Math.max(-1, Math.min(1, point.x / innerWidth * 2 - 1));
      const y = Math.max(-1, Math.min(1, point.y / innerHeight * 2 - 1));
      source.style.transform = `translate3d(${x * 38}%, ${y * 28}%, 0)`;
      const distance = Math.hypot(
        (point.x - box.left - box.width / 2) / (box.width * 0.65),
        (point.y - box.top - box.height / 2) / box.height,
      );
      const proximity = Math.max(0, 1 - Math.min(1, distance));
      halo.style.opacity = String(0.78 + proximity * 0.22);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      point = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const sync = () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(frame);
      frame = 0;
      dirty = true;
      if (visible && media.matches) {
        window.addEventListener("pointermove", move, { passive: true });
      }
      if (!media.matches) {
        source.style.removeProperty("transform");
        halo.style.removeProperty("opacity");
      }
    };
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    visibility.observe(opening);
    const resize = new ResizeObserver(invalidate);
    resize.observe(anchor);
    window.addEventListener("resize", invalidate);
    window.addEventListener("scroll", invalidate, { passive: true });
    media.addEventListener("change", sync);
    return () => {
      cancelAnimationFrame(frame);
      visibility.disconnect();
      resize.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("scroll", invalidate);
      media.removeEventListener("change", sync);
    };
  }, []);
  return (
    <a
      ref={portal}
      href="#services"
      className={s.logoPortal}
      aria-label="Explore Halenn’s services"
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
      <span className={s.portalAmbient} aria-hidden="true" />
      <span ref={glow} className={s.portalLight} aria-hidden="true">
        <span>
          <span ref={light} />
        </span>
      </span>
      {children}
      <span className={s.portalHint} aria-hidden="true">
        Explore services <Arrow down />
      </span>
    </a>
  );
}
