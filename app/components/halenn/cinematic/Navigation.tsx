"use client";

import { useEffect, useRef } from "react";
import { ActionLink } from "./Action";
import Wordmark from "./Wordmark";
import s from "./controls.module.css";

const destinations = [
  ["services", "Services"], ["goals", "Find your solution"], ["pricing", "Pricing"],
] as const;

export default function Navigation({ page = "home", homeHref = "/", pricingHref = "/pricing" }: {
  page?: "home" | "pricing" | "about" | "project-call";
  homeHref?: string;
  pricingHref?: string;
}) {
  const header = useRef<HTMLElement>(null);
  const disclosure = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const element = header.current!;
    let previous = scrollY, accumulated = 0, frame = 0;
    const update = () => {
      frame = 0;
      const delta = scrollY - previous;
      if (Math.sign(delta) !== Math.sign(accumulated)) accumulated = 0;
      accumulated += delta;
      if (scrollY < 100 || accumulated < -12) element.removeAttribute("data-hidden");
      else if (accumulated > 32 && !element.contains(document.activeElement) && !disclosure.current?.open)
        element.setAttribute("data-hidden", "");
      element.toggleAttribute("data-scrolled", scrollY > 48);
      if (scrollY < 100) element.querySelectorAll("[data-section-link][aria-current]").forEach((link) => link.removeAttribute("aria-current"));
      previous = scrollY;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const show = () => element.removeAttribute("data-hidden");
    const observer = new IntersectionObserver((entries) => {
      const active = entries.find((entry) => entry.isIntersecting);
      if (!active) return;
      element.querySelectorAll<HTMLAnchorElement>("[data-section-link]").forEach((link) => {
        if (link.hash === `#${active.target.id}`) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    }, { rootMargin: "-15% 0px -65% 0px" });
    if (page === "home") destinations.forEach(([id]) => { const section = document.getElementById(id); if (section) observer.observe(section); });
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    element.addEventListener("focusin", show);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      element.removeEventListener("focusin", show);
    };
  }, [page]);

  const homeAnchor = (id: string) => `${page === "home" ? "" : homeHref}#${id}`;
  const contactHref = page === "pricing" ? "#contact" : homeAnchor("contact");
  const links = destinations.map(([id, label]) => <a key={id}
    href={id === "pricing" ? page === "pricing" ? "#guide" : pricingHref : homeAnchor(id)}
    aria-current={id === "pricing" && page === "pricing" ? "page" : undefined}
    data-section-link={page === "home" && id !== "pricing" || undefined}>{label}</a>);
  return <header ref={header} className={s.header} data-prototype-navigation data-page={page}>
    <a href={homeAnchor("hero-content")} className={s.brand} aria-label="Halenn home"><Wordmark /><span>A company by Aevell</span></a>
    <nav className={s.quickNav} aria-label="Primary navigation">{links}</nav>
    <div className={s.headerActions}>
      <div className={s.headerBrief}><ActionLink href={contactHref} quiet plainArrow>Let’s talk</ActionLink></div>
      <details ref={disclosure} className={s.menu} onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          disclosure.current?.removeAttribute("open");
          disclosure.current?.querySelector("summary")?.focus();
        }
      }}>
        <summary aria-label="Toggle navigation menu"><span /><span /></summary>
        <nav aria-label="Mobile navigation" onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) {
            disclosure.current?.removeAttribute("open");
          }
        }}>{links}<a href={contactHref}>Let’s talk</a></nav>
      </details>
    </div>
  </header>;
}
