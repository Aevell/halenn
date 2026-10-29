"use client";

import { useEffect, useRef, type ReactNode } from "react";
import s from "./pricing.module.css";

/** Native disclosure without JS; measured, reversible motion after hydration. */
export default function Disclosure({ title, children, className, icon = false }: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  icon?: boolean;
}) {
  const root = useRef<HTMLDetailsElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const running = useRef<Animation[]>([]);
  const expanded = useRef(false);
  const finish = useRef<() => void>(() => {});

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const settle = () => finish.current();
    media.addEventListener("change", settle);
    return () => {
      running.current.forEach((animation) => animation.cancel());
      media.removeEventListener("change", settle);
    };
  }, []);

  return <details ref={root} className={className}>
    <summary onClick={(event) => {
      event.preventDefault();
      const element = root.current!;
      const body = content.current!;
      const summary = event.currentTarget;
      const from = element.getBoundingClientRect().height;
      const opacity = element.open ? getComputedStyle(body).opacity : "0";
      running.current.forEach((animation) => animation.cancel());
      const open = !expanded.current;
      expanded.current = open;
      element.dataset.expanded = String(open);
      summary.setAttribute("aria-expanded", String(open));
      body.inert = !open;
      body.setAttribute("aria-hidden", String(!open));
      element.open = true;
      element.style.height = "auto";
      const border = parseFloat(getComputedStyle(element).borderBottomWidth) + parseFloat(getComputedStyle(element).borderTopWidth);
      const to = open ? element.getBoundingClientRect().height : summary.getBoundingClientRect().height + border + parseFloat(getComputedStyle(element).paddingTop) + parseFloat(getComputedStyle(element).paddingBottom);
      const settle = () => {
        element.open = open;
        element.style.removeProperty("overflow");
        running.current.forEach((animation) => animation.cancel());
        running.current = [];
      };
      finish.current = settle;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return settle();
      element.style.overflow = "clip";
      const size = element.animate([{ height: `${from}px` }, { height: `${to}px` }], {
        duration: 280, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both",
      });
      const fade = body.animate([{ opacity }, { opacity: open ? 1 : 0 }], {
        duration: open ? 240 : 140, fill: "both",
      });
      running.current = [size, fade];
      size.onfinish = settle;
    }}>
      {title}
      {icon && <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><path d="M5 12h14M12 5v14" stroke="currentColor" strokeWidth="1.5" /></svg>}
    </summary>
    <div ref={content} className={s.disclosureBody}>{children}</div>
  </details>;
}
