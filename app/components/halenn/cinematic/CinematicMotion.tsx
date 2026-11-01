"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { previewPose, smooth } from "./flow-motion";
import styles from "./cinematic.module.css";

type Scene = { node: HTMLElement; anchor: HTMLElement; top: number; height: number };

// Native document scrolling drives the examples and distant atmosphere.
// The logo, its clearance mask and the nearby fabric share one stationary frame.
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
    const passage = find("[data-silk-passage]");
    const contact = find("#contact");
    const light = find("[data-contact-light]");
    const words = Array.from(element.querySelectorAll<HTMLElement>("[data-contact-word]"));
    const media = matchMedia("(prefers-reduced-motion: no-preference)");
    const compactMedia = matchMedia("(max-width: 1000px), (max-height: 680px)");
    const collect = (selector: string, ambient = false): Scene[] =>
      Array.from(element.querySelectorAll<HTMLElement>(selector), node => ({
        node, anchor: ambient ? node.closest<HTMLElement>("section, [data-silk-scene]") || node : node,
        top: 0, height: 0,
      }));
    const previews = collect("[data-flow-preview]");
    const intros = collect("[data-flow-intro]");
    const ambience = collect("[data-flow-ambient]", true);
    const scenes = [...previews, ...intros, ...ambience];
    const targets = [light, ...words, ...scenes.map(scene => scene.node)];
    let pending = 0, measuring = 0, hashFrame = 0, disposed = false;
    let contactTop = 0, contactHeight = 0, height = innerHeight, compact = compactMedia.matches;
    const reset = () => {
      targets.forEach(target => {
        target.style.removeProperty("transform");
        target.style.removeProperty("opacity");
      });
    };
    const set = (target: HTMLElement, property: "transform" | "opacity", value: string) => {
      if (target.style[property] !== value) target.style[property] = value;
    };
    const paint = (all = false) => {
      pending = 0;
      if (!media.matches || document.hidden) return;
      const y = scrollY;
      const visible = (top: number, size: number) => all || top < y + height + 80 && top + size > y - 80;
      const focused = document.activeElement;
      for (const scene of previews) {
        if (!visible(scene.top, scene.height)) continue;
        const distance = (y + height / 2 - scene.top - scene.height / 2) / ((height + scene.height) / 2);
        const pose = previewPose(distance, compact);
        const direction = Number(scene.node.dataset.flowPreview) % 2 ? -1 : 1;
        const focusWithin = !!focused?.matches(":focus-visible") && scene.node.contains(focused);
        set(scene.node, "transform", focusWithin ? "none" :
          `perspective(1600px) translate3d(0,${pose.y.toFixed(3)}px,0) rotateY(${(pose.angle * direction).toFixed(3)}deg)`);
      }
      for (const scene of intros) {
        if (!visible(scene.top, scene.height)) continue;
        const progress = smooth((y + height * .9 - scene.top) / (height * .5));
        set(scene.node, "transform", `translate3d(0,${((1 - progress) * (compact ? 12 : 24)).toFixed(3)}px,0)`);
        set(scene.node, "opacity", String(.85 + .15 * progress));
      }
      for (const scene of ambience) {
        if (!visible(scene.top, scene.height)) continue;
        const progress = smooth((y + height - scene.top) / (height + scene.height));
        set(scene.node, "transform", `translate3d(0,${((.5 - progress) * (compact ? 32 : 80)).toFixed(3)}px,0)`);
      }
      if (visible(contactTop, contactHeight)) {
        const progress = smooth((y - contactTop + height * .78) / (height * .65));
        words.forEach((word, index) => {
          set(word, "transform", `translate3d(${(index ? 1 : -1) * (1 - progress) * (compact ? 1 : 3)}vw,${(1 - progress) * (compact ? 12 : 25)}px,0)`);
          set(word, "opacity", String(.65 + .35 * progress));
        });
        set(light, "opacity", String(.4 + .6 * progress));
      }
    };
    const schedule = () => {
      if (!pending && !document.hidden && media.matches) pending = requestAnimationFrame(() => paint());
    };
    const measure = () => {
      measuring = 0;
      if (disposed) return;
      reset();
      height = innerHeight;
      compact = compactMedia.matches;
      // Layout reads are batched here, never in the scroll handler. ResizeObserver
      // also catches quiz answers and FAQ expansion moving later sections.
      for (const scene of scenes) {
        const bounds = scene.anchor.getBoundingClientRect();
        scene.top = bounds.top + scrollY;
        scene.height = bounds.height;
      }
      const contactBounds = contact.getBoundingClientRect();
      contactTop = contactBounds.top + scrollY;
      contactHeight = contactBounds.height;
      const logoBounds = logo.getBoundingClientRect();
      const passageBounds = passage.getBoundingClientRect();
      const openingHeight = `${opening.offsetHeight}px`;
      if (passage.style.getPropertyValue("--silk-opening-height") !== openingHeight)
        passage.style.setProperty("--silk-opening-height", openingHeight);
      exclusion.setAttribute("transform", `translate(${logoBounds.left - passageBounds.left} ${logoBounds.top - passageBounds.top})`);
      outlines.forEach(outline => outline.setAttribute("transform", `scale(${logoBounds.width / 1536} ${logoBounds.height / 1024})`));
      clearance.setAttribute("data-silk-clearance-ready", "");
      paint(true);
    };
    const queueMeasure = () => {
      if (!disposed && !measuring) measuring = requestAnimationFrame(measure);
    };
    const visibility = () => {
      cancelAnimationFrame(pending);
      pending = 0;
      if (!document.hidden) queueMeasure();
    };
    measure();
    const anchor = location.hash.slice(1);
    if (["hero-content", "goals", "services", "websites", "commerce", "automation", "apps", "projects", "process", "scope", "pricing-intro", "faq", "contact"].includes(anchor)) {
      hashFrame = requestAnimationFrame(() => {
        hashFrame = requestAnimationFrame(() => {
          if (location.hash.slice(1) !== anchor) return;
          if (anchor === "hero-content") window.scrollTo({ top: 0, behavior: "instant" });
          else element.querySelector<HTMLElement>(`#${anchor}`)?.scrollIntoView({ block: "start", behavior: "instant" });
        });
      });
    }
    const resize = new ResizeObserver(queueMeasure);
    new Set([element, opening, contact, ...scenes.map(scene => scene.anchor), ...element.querySelectorAll<HTMLElement>("section")])
      .forEach(target => resize.observe(target));
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", queueMeasure);
    element.addEventListener("focusin", schedule);
    element.addEventListener("focusout", schedule);
    element.addEventListener("load", queueMeasure, true);
    media.addEventListener("change", queueMeasure);
    compactMedia.addEventListener("change", queueMeasure);
    document.addEventListener("visibilitychange", visibility);
    document.fonts.addEventListener("loadingdone", queueMeasure);
    void document.fonts.ready.then(queueMeasure);
    return () => {
      disposed = true;
      cancelAnimationFrame(pending);
      cancelAnimationFrame(measuring);
      cancelAnimationFrame(hashFrame);
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", queueMeasure);
      element.removeEventListener("focusin", schedule);
      element.removeEventListener("focusout", schedule);
      element.removeEventListener("load", queueMeasure, true);
      media.removeEventListener("change", queueMeasure);
      compactMedia.removeEventListener("change", queueMeasure);
      document.removeEventListener("visibilitychange", visibility);
      document.fonts.removeEventListener("loadingdone", queueMeasure);
      clearance.removeAttribute("data-silk-clearance-ready");
      passage.style.removeProperty("--silk-opening-height");
      reset();
    };
  }, []);
  return <div ref={root} className={styles.motionRoot}>{children}</div>;
}
