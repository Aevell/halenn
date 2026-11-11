"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Navigation from "../components/halenn/cinematic/Navigation";
import SiteFooter from "../components/SiteFooter";
import BookingCalendar from "./BookingCalendar";
import { callPortal, type CallPortal } from "../lib/online-call";
import styles from "./project-call.module.css";

const zone = "Europe/Amsterdam";
const subscribeZone = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || zone;
const dateValue = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const time = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const fullDate = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(value));

export default function CallBooking({ token, initial, asOf }: { token: string; initial: CallPortal; asOf: string }) {
  const [portal, setPortal] = useState(initial);
  const [day, setDay] = useState(() => dateValue(new Date(Date.parse(asOf) + 86400_000)));
  const [slots, setSlots] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [language, setLanguage] = useState<"en" | "nl">("en");
  const [loading, setLoading] = useState(initial.available && !["confirmed", "pending", "review"].includes(initial.status ?? "new") && !initial.cancelRequested);
  const [working, setWorking] = useState(false);
  const [checking, setChecking] = useState(initial.status === "pending" || !!initial.cancelRequested);
  const [error, setError] = useState("");
  const [cancelPrompt, setCancelPrompt] = useState(false);
  const localZone = useSyncExternalStore(subscribeZone, browserZone, () => zone);
  const today = dateValue(new Date(asOf));
  const lastDay = dateValue(new Date(Date.parse(asOf) + 60 * 86400_000));
  const loadVersion = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStatus = useRef(initial.status);
  const endpoint = `/api/project-call/${token}`;
  const active = portal.status === "confirmed" || portal.status === "pending" || portal.status === "review";

  useEffect(() => {
    const changed = previousStatus.current !== portal.status;
    previousStatus.current = portal.status;
    if (changed && (portal.status === "confirmed" || portal.status === "cancelled")) {
      headingRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [portal.status]);

  const refresh = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    const data = await response.json();
    const next = callPortal(data.portal);
    if (!response.ok || !next) throw Error("We couldn’t check your appointment. Please try again.");
    setPortal(next);
    setChecking(next.status === "pending" || !!next.cancelRequested);
    return next;
  }, [endpoint]);

  useEffect(() => {
    if (!checking) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const poll = async () => {
      try {
        const next = await refresh();
        if (stopped || (next.status !== "pending" && !next.cancelRequested)) return;
      } catch { /* An uncertain write is not a failed booking. Keep the check available. */ }
      if (!stopped && ++attempts < 30) timer = setTimeout(poll, 4000);
    };
    timer = setTimeout(poll, 2500);
    return () => { stopped = true; clearTimeout(timer); };
  }, [checking, refresh]);

  const load = useCallback(async (chosenDay: string, signal?: AbortSignal) => {
    if (!chosenDay) return;
    const version = ++loadVersion.current;
    setLoading(true); setError(""); setSlots([]); setSelected("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "availability", day: chosenDay }), signal });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.slots) || data.slots.some((slot: unknown) => typeof slot !== "string" || !Number.isFinite(Date.parse(slot)))) throw Error(data.error || "Available times couldn’t be loaded.");
      if (!signal?.aborted && version === loadVersion.current) setSlots(data.slots);
    } catch (err) {
      if (!signal?.aborted && version === loadVersion.current) setError(err instanceof Error ? err.message : "Please try again.");
    } finally { if (!signal?.aborted && version === loadVersion.current) setLoading(false); }
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    if (portal.available && !active && !checking) void Promise.resolve().then(() => {
      if (!controller.signal.aborted) return load(day, controller.signal);
    });
    return () => controller.abort();
  }, [day, load, portal.available, active, checking]);

  async function act(operation: "book" | "cancel") {
    if (working) return;
    setWorking(true); setError(""); setCancelPrompt(false);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, startsAt: selected || null, language }) });
      const data = await response.json();
      const next = callPortal(data.portal);
      if (data.checking) {
        setChecking(true); setError(data.error);
        await refresh().catch(() => undefined);
      } else if (!response.ok || !next) throw Error(data.error || "We couldn’t check your appointment.");
      else {
        setPortal(next); setChecking(next.status === "pending" || !!next.cancelRequested);
        if (next.status === "unavailable") { await load(day); setError("That time has just become unavailable. Please choose another time."); }
      }
    } catch {
      // A browser connection can fail after the calendar write succeeds.
      setChecking(true);
      setError("We’re checking your appointment. Please keep this page open or return using the same link.");
      await refresh().catch(() => undefined);
    }
    finally { setWorking(false); }
  }

  const chosen = portal.status === "confirmed" ? portal.startsAt : selected;
  const localTime = chosen && localZone !== zone ? new Intl.DateTimeFormat("en-GB", { timeZone: localZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(new Date(chosen)) : null;

  return <div className={styles.page}>
    <Navigation page="project-call" />
    <main className={`${styles.content} ${styles.bookingContent}`}>
      <p className={styles.eyebrow}>{portal.status === "confirmed" ? "Your 30-minute project call" : "Optional · 30-minute project call"}</p>
      <h1 ref={headingRef} tabIndex={-1}>{portal.status === "confirmed" ? <>Your call is<br /><span>confirmed.</span></> : portal.status === "cancelled" ? <>Let’s find<br /><span>another time.</span></> : <>A conversation.<br /><span>A clear next step.</span></>}</h1>
      <p>{portal.status === "confirmed" ? "Your time is reserved. We look forward to discussing your project." : "Your enquiry is already with us. A call is an optional way to talk it through; we can also continue by email."}</p>
      {portal.status === "cancelled" && <p role="status">Your previous appointment is cancelled. You’re welcome to choose another time below.</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {(checking || portal.status === "pending" || portal.status === "review") ? <section className={styles.statusPanel} aria-live="polite">
        <h2>{portal.cancelRequested ? "We’re cancelling your appointment." : "We’re checking your appointment."}</h2>
        <p>{portal.status === "review" ? "Your enquiry is safe. We’ll help arrange your call by email." : "Please keep this page open for a moment. You can also return using this same link. There’s no need to send another enquiry."}</p>
        <button className={styles.textButton} disabled={working} onClick={() => refresh().then(() => setError("")).catch(e => setError(e.message))}>Check appointment status</button>
        {portal.status === "pending" && !portal.cancelRequested && <button className={styles.textButton} disabled={working} onClick={() => act("book")}>Try confirming again</button>}
      </section> : portal.status === "confirmed" && portal.startsAt ? <div className={styles.confirmationGrid}>
        <section className={styles.appointmentDetails} aria-labelledby="appointment-title">
          <h2 id="appointment-title">Your appointment.</h2>
          <p className={styles.appointmentDate}>{fullDate(portal.startsAt)}</p>
          <p className={styles.appointmentTime}>{time(portal.startsAt)}–{time(new Date(Date.parse(portal.startsAt) + 1800_000).toISOString())}<span>Amsterdam time</span></p>
          {localTime && <p className={styles.quiet}>Your local time: {localTime}</p>}
          <dl className={styles.appointmentFacts}>
            <div><dt>Conversation</dt><dd>{portal.language === "nl" ? "Dutch · with Dave" : "English · with Dave or Terence"}</dd></div>
            <div><dt>Format</dt><dd>30 minutes · Google Meet</dd></div>
          </dl>
          <div className={styles.confirmationActions}>
            {portal.meetUrl && <a href={portal.meetUrl} className={styles.primary}>Join your call <span aria-hidden="true">↗</span></a>}
            <a href={`/project-call/${token}/calendar`} className={styles.textButton}>Add to calendar <span aria-hidden="true">↗</span></a>
          </div>
          <div className={styles.manageCall}>
            {cancelPrompt ? <div className={styles.cancelPrompt} role="alertdialog" aria-label="Cancel your appointment">
              <p>Cancel this appointment? Your enquiry will stay with us, and you can choose another time.</p>
              <button className={styles.textButton} onClick={() => act("cancel")} disabled={working}>Yes, cancel the call</button>
              <button className={styles.textButton} onClick={() => setCancelPrompt(false)}>Keep appointment</button>
            </div> : <button className={styles.textButton} onClick={() => setCancelPrompt(true)} disabled={working}>Cancel appointment</button>}
          </div>
        </section>
        <section className={styles.confirmationNext} aria-labelledby="next-title">
          <h2 id="next-title">What happens next.</h2>
          <ol className={styles.nextSteps}>
            <li><span aria-hidden="true">01</span><div><h3>Your details, together.</h3><p>Your confirmation email brings together your call details, enquiry summary and next steps.</p></div></li>
            <li><span aria-hidden="true">02</span><div><h3>Come as you are.</h3><p>We’ll review your enquiry before we meet. There’s no need to prepare a technical brief.</p></div></li>
          </ol>
          <p className={styles.quiet}>Anything to add? Simply reply to your confirmation email.</p>
        </section>
      </div> : !portal.available ? <section className={styles.statusPanel}>
        <h2>We can arrange a call by email.</h2><p>Online booking is temporarily unavailable. Your enquiry is still with us, and we’ll follow up.</p>
      </section> : <div className={styles.bookingGrid}>
        <section aria-labelledby="choose-time">
          <h2 id="choose-time">Choose your time.</h2>
          <p className={styles.quiet}>30 minutes · Google Meet · Amsterdam time</p>
          <div className={styles.dateAndTimes}>
            <BookingCalendar value={day} min={today} max={lastDay} disabled={working} onChange={chosenDay => { if (chosenDay !== day) { setDay(chosenDay); setSelected(""); setSlots([]); setLoading(true); } }} />
            <div className={styles.timeChoices}>
              <h3>{new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${day}T12:00:00Z`))}</h3>
              <div aria-busy={loading} className={styles.slots} role="group" aria-label="Available appointment times">
                {loading ? <p role="status">Finding available times…</p> : slots.map(slot => <button key={slot} type="button" aria-pressed={slot === selected} onClick={() => setSelected(slot)} disabled={working}><span>{time(slot)}</span>{slot === selected && <span className={styles.slotCheck} aria-hidden="true">✓</span>}</button>)}
              </div>
              {!loading && !slots.length && !error && <p className={styles.quiet} role="status">No times on this date. Please choose another day.</p>}
              {!loading && error && <button className={styles.textButton} onClick={() => load(day)}>Try loading times again</button>}
            </div>
          </div>
        </section>
        <section className={styles.bookingSummary} aria-labelledby="call-details">
          <h2 id="call-details">Your project call.</h2>
          <p>We’ll discuss your business, your priorities and how Halenn could help. There’s no need to prepare a technical brief.</p>
          <fieldset className={styles.languageChoices} disabled={working}>
            <legend>Preferred language</legend>
            {(["en", "nl"] as const).map(option => <label key={option}><input type="radio" name="call-language" value={option} checked={language === option} onChange={() => setLanguage(option)} /><span>{option === "en" ? "English" : "Dutch"}</span></label>)}
          </fieldset>
          <p className={styles.quiet}>{language === "nl" ? "Dave will join you." : "Dave or Terence will join you."}</p>
          {selected && <div className={styles.selection} aria-live="polite"><strong>{fullDate(selected)}</strong><br />{time(selected)} · Amsterdam time{localTime && <p className={styles.quiet}>Your local time: {localTime}</p>}</div>}
          <div className={styles.bookingSubmit}>
            <button className={styles.primary} disabled={!selected || working || loading} onClick={() => act("book")}>{working ? "Confirming your call…" : "Confirm my call"}<span aria-hidden="true">↗</span></button>
            <p className={styles.quiet}>We’ll send your call details and enquiry summary to the email address you used for your enquiry.</p>
          </div>
        </section>
      </div>}
      <Link className={styles.backLink} href="/">{portal.status === "confirmed" ? "Back to Halenn" : "Done — hear from us by email"}<span aria-hidden="true">↗</span></Link>
    </main>
    <SiteFooter />
  </div>;
}
