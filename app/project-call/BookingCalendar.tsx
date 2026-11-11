"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import styles from "./project-call.module.css";

const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const asDate = (day: string) => new Date(`${day}T12:00:00Z`);
const dayLabel = (day: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(asDate(day));
const addDays = (day: string, amount: number) => { const date = asDate(day); date.setUTCDate(date.getUTCDate() + amount); return isoDay(date); };
const addMonths = (day: string, amount: number) => {
  const date = asDate(day), originalDay = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + amount);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, last));
  return isoDay(date);
};

export default function BookingCalendar({ value, min, max, disabled, onChange }: {
  value: string; min: string; max: string; disabled: boolean; onChange: (day: string) => void;
}) {
  const id = useId();
  const [month, setMonth] = useState(value.slice(0, 7));
  const [focusedDay, setFocusedDay] = useState(value);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const moveFocus = useRef(false);
  const clamp = (day: string) => day < min ? min : day > max ? max : day;
  const first = `${month}-01`;
  const offset = (asDate(first).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const monthLabel = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }).format(asDate(first));

  useEffect(() => {
    if (moveFocus.current) { buttons.current.get(focusedDay)?.focus(); moveFocus.current = false; }
  }, [focusedDay, month]);

  function browse(amount: number) {
    const next = addMonths(first, amount).slice(0, 7);
    setMonth(next);
    setFocusedDay(value.startsWith(next) ? value : clamp(`${next}-01`));
  }

  function navigate(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    const weekday = (asDate(day).getUTCDay() + 6) % 7;
    const changes: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday };
    const next = event.key in changes ? addDays(day, changes[event.key]) : event.key === "PageUp" ? addMonths(day, -1) : event.key === "PageDown" ? addMonths(day, 1) : null;
    if (!next) return;
    event.preventDefault();
    const target = clamp(next);
    if (target === day) return;
    moveFocus.current = true; setFocusedDay(target); setMonth(target.slice(0, 7));
  }

  return <div className={styles.calendar} role="group" aria-label="Choose a date" aria-describedby={`${id}-help`}>
    <div className={styles.monthHeading}>
      <h3 aria-live="polite">{monthLabel}</h3>
      <div className={styles.monthNavigation}>
        <button type="button" aria-label="Previous month" disabled={disabled || month <= min.slice(0, 7)} onClick={() => browse(-1)}><span aria-hidden="true">←</span></button>
        <button type="button" aria-label="Next month" disabled={disabled || month >= max.slice(0, 7)} onClick={() => browse(1)}><span aria-hidden="true">→</span></button>
      </div>
    </div>
    <p id={`${id}-help`} className={styles.srOnly}>Use the arrow keys to move between dates, Page Up or Page Down to change month, and Enter to select.</p>
    <div className={styles.weekdays} aria-hidden="true">{["M", "T", "W", "T", "F", "S", "S"].map((day, i) => <span key={i}>{day}</span>)}</div>
    <div className={styles.calendarDays}>
      {Array.from({ length: offset }, (_, i) => <span key={`empty-${i}`} />)}
      {Array.from({ length: daysInMonth }, (_, i) => {
        const day = `${month}-${String(i + 1).padStart(2, "0")}`;
        return <button key={day} ref={button => { if (button) buttons.current.set(day, button); else buttons.current.delete(day); }} type="button"
          aria-label={dayLabel(day)} aria-pressed={day === value} aria-current={day === min ? "date" : undefined}
          disabled={disabled || day < min || day > max} tabIndex={day === focusedDay ? 0 : -1}
          onKeyDown={event => navigate(event, day)} onFocus={() => setFocusedDay(day)}
          onClick={() => { setFocusedDay(day); onChange(day); }}>{i + 1}</button>;
      })}
    </div>
  </div>;
}
