"use client";

import { type ReactNode, useEffect, useRef } from "react";
import s from "./hero.module.css";

type Point = { x: number; y: number };

/** Sample the artwork's alpha for the light path; never transform or edit the logo. */
export default function RibbonLight({ children }: { children: ReactNode }) {
  const surface = useRef<HTMLAnchorElement>(null);
  const light = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const anchor = surface.current;
    const glow = light.current;
    const image = anchor?.querySelector("img");
    if (!anchor || !glow || !image) return;
    const media = matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    let visible = false, frame = 0, dirty = true;
    let bounds = anchor.getBoundingClientRect();
    let pointer: Point = { x: 0, y: 0 };
    let contour: Point[] = [];
    const invalidate = () => { dirty = true; };
    const paint = () => {
      frame = 0;
      if (dirty) { bounds = anchor.getBoundingClientRect(); dirty = false; }
      let nearest: Point | undefined;
      let distance = Infinity;
      for (const point of contour) {
        const dx = bounds.left + point.x * bounds.width - pointer.x;
        const dy = bounds.top + point.y * bounds.height - pointer.y;
        const squared = dx * dx + dy * dy;
        if (squared < distance) { nearest = point; distance = squared; }
      }
      if (!nearest) return;
      anchor.style.setProperty("--ribbon-light-x", `${(nearest.x - .5) * 100}%`);
      anchor.style.setProperty("--ribbon-light-y", `${(nearest.y - .5) * 100}%`);
      const proximity = 1 - Math.min(1, Math.sqrt(distance) / (bounds.width * .7));
      glow.style.opacity = String(.55 + proximity * .45);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointer = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const sync = () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(frame);
      frame = 0;
      if (visible && media.matches && contour.length) window.addEventListener("pointermove", move, { passive: true });
      if (!media.matches) {
        anchor.style.removeProperty("--ribbon-light-x");
        anchor.style.removeProperty("--ribbon-light-y");
        glow.style.removeProperty("opacity");
      }
    };
    const sample = () => {
      if (!image.naturalWidth) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 192;
        canvas.height = Math.round(canvas.width * image.naturalHeight / image.naturalWidth);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        const alpha = (x: number, y: number) => data[(y * canvas.width + x) * 4 + 3];
        contour = [];
        // Opaque silver above the reflected floor; both inner and outer edges
        // come from the bitmap, not an approximated ellipse or the old triangle.
        for (let y = 1; y < canvas.height * .84; y++) {
          for (let x = 1; x < canvas.width - 1; x++) {
            if (alpha(x, y) < 220) continue;
            if ([alpha(x - 1, y), alpha(x + 1, y), alpha(x, y - 1), alpha(x, y + 1)].some(value => value < 220)) {
              contour.push({ x: (x + .5) / canvas.width, y: (y + .5) / canvas.height });
            }
          }
        }
      } catch {
        // If canvas sampling is unavailable, the authored static light remains.
        contour = [];
      }
      sync();
    };
    image.addEventListener("load", sample);
    if (image.complete) sample();
    const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    visibility.observe(anchor);
    const resize = new ResizeObserver(invalidate);
    resize.observe(anchor);
    window.addEventListener("resize", invalidate);
    window.addEventListener("scroll", invalidate, { passive: true });
    media.addEventListener("change", sync);
    return () => {
      cancelAnimationFrame(frame);
      visibility.disconnect();
      resize.disconnect();
      image.removeEventListener("load", sample);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("scroll", invalidate);
      media.removeEventListener("change", sync);
    };
  }, []);

  return <a ref={surface} href="#services" className={s.ribbon} aria-label="Explore Halenn’s services" data-ribbon-art>
    <span ref={light} className={s.ribbonLight} aria-hidden="true" data-ribbon-light>
      <span className={s.ribbonBloom}><span className={s.ribbonMask}><span className={s.lightSource} /></span></span>
      <span className={s.ribbonRim}><span className={s.ribbonMask}><span className={s.lightSource} /></span></span>
    </span>
    {children}
  </a>;
}
