"use client";

import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./heroes.module.css";
import "./picker.css";

const names = ["Cinematic", "Editorial", "Foundation"];

export default function PrototypePicker({ initial, children }: { initial: number; children: ReactNode[] }) {
  const [selected, setSelected] = useState(initial);
  const [replay, setReplay] = useState(0);
  const picker = useRef<HTMLElement>(null);
  const highlight = useRef<HTMLSpanElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = useRef(initial);

  const select = useCallback((index: number) => {
    activeIndex.current = index;
    setSelected(index);
    setReplay((value) => value + 1);
    const url = new URL(window.location.href);
    url.searchParams.set("v", String(index + 1));
    url.hash = "";
    window.history.replaceState(null, "", url);
  }, []);

  useLayoutEffect(() => {
    if (replay > 0 || !window.location.hash) window.scrollTo({ top: 0, behavior: "instant" });
    if (replay > 0 && window.location.hash) {
      const url = new URL(window.location.href);
      url.hash = "";
      window.history.replaceState(null, "", url);
    }
    const measure = () => {
      const item = items.current[selected];
      if (!item || !highlight.current) return;
      highlight.current.style.width = `${item.offsetWidth}px`;
      highlight.current.style.transform = `translateX(${item.offsetLeft}px)`;
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (picker.current) observer.observe(picker.current);
    return () => observer.disconnect();
  }, [selected, replay]);

  useEffect(() => {
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => picker.current?.setAttribute("data-ready", ""));
    });
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.closest("input, textarea, select, details, [data-local-keys], [contenteditable]:not([contenteditable='false'])"))) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (/^[1-3]$/.test(event.key)) select(Number(event.key) - 1);
      else if (event.key === "ArrowRight") select((activeIndex.current + 1) % names.length);
      else if (event.key === "ArrowLeft") select((activeIndex.current + names.length - 1) % names.length);
      else if (event.key.toLowerCase() === "r") setReplay((value) => value + 1);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      window.removeEventListener("keydown", handleKey);
    };
  }, [select]);

  return (
    <div className={styles.harness}>
      <div key={`${selected}-${replay}`} data-prototype-stage>{children[selected]}</div>
      <nav ref={picker} className="proto-picker" aria-label="Prototype variants">
        <span ref={highlight} className="proto-picker-highlight" aria-hidden="true" />
        {names.map((name, index) => (
          <button
            ref={(element) => { items.current[index] = element; }}
            type="button"
            key={name}
            className="proto-picker-item"
            data-active={selected === index ? "" : undefined}
            aria-current={selected === index ? "true" : undefined}
            onClick={() => select(index)}
          >{name}</button>
        ))}
        <span className="proto-picker-divider" aria-hidden="true" />
        <button className="proto-picker-item proto-picker-replay" type="button" aria-label="Replay animation (R)" onClick={() => setReplay((value) => value + 1)}>↻</button>
      </nav>
      <span className={styles.srOnly} aria-live="polite">{names[selected]} hero prototype</span>
    </div>
  );
}
