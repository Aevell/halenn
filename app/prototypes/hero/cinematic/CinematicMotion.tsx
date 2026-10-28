"use client";

import { type ReactNode, useEffect, useRef } from "react";
import styles from "./cinematic.module.css";

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => { const p = clamp(value); return p * p * (3 - 2 * p); };

// One native scroll timeline. Geometry is measured on resize, never on a scroll frame.
export default function CinematicMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current!;
    const find = (selector: string) => element.querySelector<HTMLElement>(selector)!;
    const services = find("[data-services]");
    const serviceStage = find("[data-service-stage]");
    const camera = find("[data-service-camera]");
    const website = find("[data-website-visual]");
    const checkout = find("[data-checkout-visual]");
    const workflow = find("[data-workflow-visual]");
    const progress = find("[data-service-progress]");
    const light = find("[data-service-light]");
    const clearance = find("[data-silk-clearance]");
    const exclusion = element.querySelector<SVGGElement>("[data-silk-exclusion]")!;
    const outlines = element.querySelectorAll<SVGPathElement>("[data-silk-outline]");
    const logo = find("[data-ribbon-art] img");
    const opening = find("[data-opening]");
    const gallery = find("[data-project-stage]");
    const process = find("[data-process-stage]");
    const scope = find("[data-scope-heading]");
    const contactLight = find("[data-contact-light]");
    const words = Array.from(element.querySelectorAll<HTMLElement>("[data-contact-word]"));
    const chapters = Array.from(element.querySelectorAll<HTMLElement>("[data-service-chapter]"));
    const sections = [services, find("#projects"), find("#process"), find("#scope"), find("#contact")];
    const targets = [camera, website, checkout, workflow, progress, light, gallery, process, scope, contactLight, ...words, ...chapters];
    const desktop = matchMedia("(min-width:1001px) and (min-height:681px) and (prefers-reduced-motion:no-preference)");
    const phone = matchMedia("(max-width:600px) and (min-height:740px) and (prefers-reduced-motion:no-preference)");
    let pending = 0, hashFrame = 0, active = false, pocket = false, height = innerHeight;
    let boundaries: number[] = [];
    const reset = () => {
      services.style.removeProperty("--service-curtain");
      targets.forEach((target) => {
        target.style.removeProperty("transform");
        target.style.removeProperty("opacity");
      });
    };
    const paint = () => {
      pending = 0;
      const y = scrollY;
      const [serviceTop, galleryTop, processTop, scopeTop, contactTop] = boundaries;
      if (!active) return;
      const arrival = (top: number) => smooth((y - top + height * .78) / (height * .65));
      const galleryIn = arrival(galleryTop), processIn = arrival(processTop);
      const scopeIn = arrival(scopeTop), contactIn = arrival(contactTop);
      const entrance = arrival(serviceTop);
      const phase = (y - serviceTop) / height;
      // Keep the incoming mobile scene transparent until its preview pins.
      if (pocket) services.style.setProperty("--service-curtain", String(smooth(phase / .4)));
      const order = smooth((phase - .35) / .65);
      const connected = smooth((phase - 1.35) / .65);
      const travel = pocket ? .4 : 1;
      if (pocket) chapters.forEach((chapter, index) => {
        const offset = phase - index;
        const incoming = clamp((offset + .72) / .32);
        const outgoing = 1 - clamp((offset - .06) / .32);
        const keyboardFocus = chapter.contains(document.activeElement) && !!document.activeElement?.matches("a:focus-visible, button:focus-visible");
        chapter.style.opacity = String(keyboardFocus ? 1 : incoming * outgoing);
      });
      const focused = document.activeElement;
      const pose = (target: HTMLElement, transform: string, opacity = 1) => {
        const focusWithin = !!focused && focused.matches(":focus-visible") && target.contains(focused);
        target.style.transform = focusWithin ? "none" : transform;
        target.style.opacity = String(focusWithin ? 1 : opacity);
      };
      pose(camera, `translate3d(0,${((1 - entrance) * 80 - galleryIn * 60) * travel}px,0) scale(${.88 + .12 * entrance - .08 * galleryIn})`, 1 - galleryIn * .6);
      pose(website, `translate3d(${-order * 9 - connected * 4}%,${-order * 4 - connected * 5}%,0) rotateY(${-order * 7 - connected * 3}deg) scale(${1 - order * .12 - connected * .04})`, 1 - connected * .65);
      pose(checkout, `translate3d(${connected * -8}%,${(1 - order) * 25 - connected * 12}%,0) scale(${.92 + order * .08 - connected * .08})`, order * (1 - connected));
      pose(workflow, `translate3d(0,${(1 - connected) * 24}%,0) scale(${.92 + connected * .08})`, connected);
      progress.style.transform = `scaleX(${clamp(phase / 2)})`;
      light.style.opacity = String(.6 + order * .2 + connected * .2);
      pose(gallery, `translate3d(0,${((1 - galleryIn) * 100 - processIn * 70) * travel}px,0) scale(${.94 + galleryIn * .06 - processIn * .04})`, 1 - processIn * .65);
      pose(process, `translate3d(0,${((1 - processIn) * 90 - scopeIn * 55) * travel}px,0)`, 1 - scopeIn * .5);
      pose(scope, `translate3d(0,${((1 - scopeIn) * 55 - contactIn * 40) * travel}px,0)`);
      words.forEach((word, i) => pose(word, `translate3d(${(i ? 1 : -1) * (1 - contactIn) * 8 * travel}vw,${(1 - contactIn) * 65 * travel}px,0)`, .45 + .55 * contactIn));
      pose(contactLight, `translate3d(0,${(1 - contactIn) * 18}%,0) scale(${.8 + contactIn * .2})`, .4 + contactIn * .6);
    };
    const schedule = () => {
      if (!pending && !document.hidden && active) pending = requestAnimationFrame(paint);
    };
    const measure = () => {
      reset();
      height = innerHeight;
      pocket = phone.matches;
      active = desktop.matches || pocket;
      services.toggleAttribute("data-service-motion", active);
      // Text zoom / short screens fall back to a regular readable document.
      if (active && chapters.some((chapter) => chapter.scrollHeight > height + 2)) {
        active = false;
        pocket = false;
        services.removeAttribute("data-service-motion");
      }
      element.toggleAttribute("data-flow-motion", active && !pocket);
      element.toggleAttribute("data-mobile-flow", active && pocket);
      boundaries = sections.map((section) => section.getBoundingClientRect().top + scrollY);
      const logoBounds = logo.getBoundingClientRect();
      const openingBounds = opening.getBoundingClientRect();
      // Silk, artwork, and copy now leave as one page-bound scene.
      // Their relative geometry stays fixed throughout native scrolling.
      exclusion.setAttribute("transform", `translate(${logoBounds.left} ${logoBounds.top - openingBounds.top})`);
      outlines.forEach((outline) => outline.setAttribute("transform", `scale(${logoBounds.width / 1536} ${logoBounds.height / 1024})`));
      paint();
      clearance.setAttribute("data-silk-clearance-ready", "");
    };
    measure();
    // Anchor restoration runs after both the scene layout and the browser's
    // initial scroll restoration, including a reload at a different breakpoint.
    const anchor = location.hash.slice(1);
    if (["hero-content", "services", "websites", "commerce", "automation", "projects", "process", "scope", "contact"].includes(anchor)) {
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
    resize.observe(serviceStage);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", measure);
    element.addEventListener("focusin", schedule);
    element.addEventListener("focusout", schedule);
    desktop.addEventListener("change", measure);
    phone.addEventListener("change", measure);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      cancelAnimationFrame(pending);
      cancelAnimationFrame(hashFrame);
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", measure);
      element.removeEventListener("focusin", schedule);
      element.removeEventListener("focusout", schedule);
      desktop.removeEventListener("change", measure);
      phone.removeEventListener("change", measure);
      document.removeEventListener("visibilitychange", schedule);
      clearance.removeAttribute("data-silk-clearance-ready");
      reset();
    };
  }, []);
  return <div ref={root} className={styles.motionRoot}>{children}</div>;
}
