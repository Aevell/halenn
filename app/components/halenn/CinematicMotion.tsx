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
    const progress = element.querySelector<HTMLElement>(
      "[data-scroll-progress]",
    );
    const copy = element.querySelector<HTMLElement>("[data-hero-copy]");
    const asides = element.querySelectorAll<HTMLElement>("[data-hero-aside]");
    if (!scene || !stage || !frame || !type || !progress || !copy) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compact = window.matchMedia(
      "(max-height: 680px), (min-width: 601px) and (max-width: 1000px)",
    );
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
      const expansion = clamp(position / 0.78);
      frame.style.transform = `scale(${0.46 + 0.54 * expansion})`;
      type.style.transform = `translate3d(${-expansion * 7}%, 0, 0)`;
      type.style.opacity = String(1 - expansion);
      progress.style.transform = `scaleX(${position})`;
      const departure = clamp(y / height);
      copy.style.transform = `translate3d(0, ${-departure * 80}px, 0)`;
      copy.style.opacity = String(1 - departure);
      asides.forEach((aside) => {
        aside.style.opacity = String(1 - departure);
      });
    };
    const requestPaint = () => {
      if (!pending && active) pending = requestAnimationFrame(paint);
    };
    const measure = () => {
      active =
        !reduced.matches &&
        !compact.matches &&
        frame.offsetHeight <= window.innerHeight - 100;
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
    resize.observe(frame);
    // Keyboard focus must never land inside a visually miniaturised scene.
    const revealFocusedFrame = (event: FocusEvent) => {
      if (
        !active ||
        !(event.target instanceof Node) ||
        !frame.contains(event.target)
      )
        return;
      if (window.scrollY < top + range * 0.78)
        window.scrollTo({ top: top + range * 0.78, behavior: "instant" });
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

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const projects = element.querySelector<HTMLElement>("#projects")!;
    const process = element.querySelector<HTMLElement>("#process")!;
    const scope = element.querySelector<HTMLElement>("#scope")!;
    const contact = element.querySelector<HTMLElement>("#contact")!;
    const serviceCamera = element.querySelector<HTMLElement>(
      "[data-service-camera]",
    )!;
    const sceneProgress = element.querySelector<HTMLElement>(
      "[data-scene-progress]",
    )!;
    const projectStage = element.querySelector<HTMLElement>(
      "[data-project-stage]",
    )!;
    const processStage = element.querySelector<HTMLElement>(
      "[data-process-stage]",
    )!;
    const scopeHeading = element.querySelector<HTMLElement>(
      "[data-scope-heading]",
    )!;
    const words = Array.from(
      element.querySelectorAll<HTMLElement>("[data-contact-word]"),
    );
    const targets = [
      serviceCamera,
      sceneProgress,
      projectStage,
      processStage,
      scopeHeading,
      ...words,
    ];
    const media = matchMedia(
      "(min-width: 1001px) and (min-height: 800px) and (prefers-reduced-motion: no-preference)",
    );
    const phone = matchMedia(
      "(max-width: 600px) and (min-height: 700px) and (prefers-reduced-motion: no-preference)",
    );
    let pending = 0;
    let height = innerHeight,
      width = innerWidth;
    let boundaries = [0, 0, 0, 0];
    const clear = () =>
      targets.forEach((target) => {
        target.style.removeProperty("transform");
        target.style.removeProperty("opacity");
      });
    // Adjacent chapters share the same handoff interval. No scroll interception,
    // delayed easing, or React renders: reversing the wheel reverses the camera.
    const arrival = (top: number) =>
      clamp((scrollY - top + height * 0.8) / (height * 0.68));
    const paint = () => {
      pending = 0;
      if (!media.matches && !phone.matches) return;
      const travel = phone.matches ? 0.35 : 1;
      const [gallery, chapters, brief, ending] = boundaries.map(arrival);
      sceneProgress.style.opacity = String(1 - clamp(gallery * 4));
      const focused = document.activeElement;
      const pose = (target: HTMLElement, transform: string, opacity = 1) => {
        const hasFocus =
          !!focused &&
          focused.matches(":focus-visible") &&
          target.contains(focused);
        target.style.transform = hasFocus ? "none" : transform;
        target.style.opacity = String(hasFocus ? 1 : opacity);
      };
      pose(
        serviceCamera,
        `translate3d(${-gallery * width * 0.12 * travel}px, ${-gallery * 70 * travel}px, 0) scale(${1 - gallery * 0.08 * travel})`,
        1 - gallery * 0.65 * travel,
      );
      pose(
        projectStage,
        `translate3d(${((1 - gallery) * width * 0.12 - chapters * width * 0.08) * travel}px, ${((1 - gallery) * 90 - chapters * 40) * travel}px, 0) scale(${0.94 + gallery * 0.06 - chapters * 0.04})`,
        1 - chapters * 0.65 * travel,
      );
      pose(
        processStage,
        `translate3d(${(1 - chapters) * width * 0.1 * travel}px, ${((1 - chapters) * 70 - brief * 50) * travel}px, 0)`,
        1 - brief * 0.55 * travel,
      );
      pose(
        scopeHeading,
        `translate3d(0, ${((1 - brief) * 70 - ending * 55) * travel}px, 0)`,
        1 - ending * 0.45 * travel,
      );
      words.forEach((word, index) =>
        pose(
          word,
          `translate3d(${(index ? 1 : -1) * (1 - ending) * width * 0.12 * travel}px, ${(1 - ending) * 90 * travel}px, 0)`,
          0.35 + ending * 0.65,
        ),
      );
    };
    const schedule = () => {
      if (!pending && (media.matches || phone.matches))
        pending = requestAnimationFrame(paint);
    };
    const measure = () => {
      element.toggleAttribute("data-flow-motion", media.matches);
      element.toggleAttribute("data-mobile-flow", phone.matches);
      clear();
      height = innerHeight;
      width = innerWidth;
      boundaries = [projects, process, scope, contact].map(
        (section) => section.getBoundingClientRect().top + scrollY,
      );
      schedule();
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", measure);
    element.addEventListener("focusin", schedule);
    element.addEventListener("focusout", schedule);
    media.addEventListener("change", measure);
    phone.addEventListener("change", measure);
    return () => {
      cancelAnimationFrame(pending);
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", measure);
      element.removeEventListener("focusin", schedule);
      element.removeEventListener("focusout", schedule);
      media.removeEventListener("change", measure);
      phone.removeEventListener("change", measure);
      clear();
    };
  }, []);

  return (
    <div ref={root} className={styles.motionRoot}>
      {children}
    </div>
  );
}
