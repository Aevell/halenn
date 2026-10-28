"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { createSilkRenderer } from "./silk-renderer";
import s from "./refraction.module.css";

export default function Silk({ sizes = "(max-width:600px) 360vw, (max-width:1000px) 220vw, 144vw", eager = false }: { sizes?: string; eager?: boolean }) {
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const element = surface.current!;
    const output = canvas.current!;
    const still = image.current!;
    const scene = element.closest<HTMLElement>("[data-silk-scene]")!;
    const anchor = scene.closest<HTMLElement>("section") || scene;
    const motion = matchMedia("(prefers-reduced-motion:no-preference)");
    let renderer: ReturnType<typeof createSilkRenderer> = null;
    let frame = 0, lastTick = 0, lastDraw = 0, phase = 0, seconds = 0, dirty = true;
    let visible = false, sceneTop = 0, viewportHeight = innerHeight;
    let width = element.clientWidth, height = element.clientHeight, failed = false, ready = false;
    const allowed = () => visible && motion.matches && !document.hidden;
    const tick = (now: number) => {
      frame = 0;
      if (!renderer || !allowed()) return;
      const delta = lastTick ? Math.min(now - lastTick, 80) : 0;
      lastTick = now;
      seconds += delta / 1000;
      const target = Math.max(0, Math.min(1, (scrollY - sceneTop) / (viewportHeight * 2.5)));
      phase += (target - phase) * (1 - Math.exp(-delta / 120));
      const draw = dirty || now - lastDraw >= 1000 / 30 - 1;
      if (draw) {
        renderer.draw(phase, seconds);
        lastDraw = now;
        dirty = false;
        if (!ready) {
          element.setAttribute("data-silk-ready", "");
          ready = true;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (frame || !renderer || !allowed()) return;
      lastTick = 0;
      element.setAttribute("data-silk-running", "");
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTick = 0;
      const run = allowed() && still.complete && still.naturalWidth > 0 && !failed;
      if (run && !renderer) {
        renderer = createSilkRenderer(output, still);
        failed = !renderer;
        renderer?.resize(width, height);
      }
      element.removeAttribute("data-silk-running");
      dirty = true;
      if (run && renderer) wake();
    };
    const measure = () => {
      width = element.clientWidth;
      height = element.clientHeight;
      sceneTop = anchor.getBoundingClientRect().top + scrollY;
      viewportHeight = innerHeight;
      renderer?.resize(width, height);
      sync();
    };
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      measure();
    });
    visibility.observe(scene);
    window.addEventListener("resize", measure);
    const contextLost = (event: Event) => {
      event.preventDefault();
      failed = true;
      ready = false;
      renderer = null;
      element.removeAttribute("data-silk-ready");
      sync();
    };
    const contextRestored = () => { failed = false; sync(); };
    output.addEventListener("webglcontextlost", contextLost);
    output.addEventListener("webglcontextrestored", contextRestored);
    still.addEventListener("load", sync);
    motion.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      visibility.disconnect();
      window.removeEventListener("resize", measure);
      renderer?.dispose();
      output.removeEventListener("webglcontextlost", contextLost);
      output.removeEventListener("webglcontextrestored", contextRestored);
      still.removeEventListener("load", sync);
      motion.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      element.removeAttribute("data-silk-ready");
      element.removeAttribute("data-silk-running");
    };
  }, []);
  return <div ref={surface} className={s.silk} data-silk>
    <Image ref={image} src="/brand/halenn-silk-v1.png" alt="" fill
      sizes={sizes} loading={eager ? "eager" : "lazy"} draggable={false} />
    <canvas ref={canvas} className={s.fabric} aria-hidden="true" />
  </div>;
}
