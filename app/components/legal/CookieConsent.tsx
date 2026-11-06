"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { CONSENT_COOKIE, consentCookie, parseConsent, type Consent } from "./consent-model";
import s from "./consent.module.css";

const PrivacyContext = createContext<((source: HTMLElement) => void) | null>(null);
const subscribe = () => () => {};
const client = () => true;
const server = () => false;

function readChoice() {
  if (typeof document === "undefined") return null;
  try { return parseConsent(document.cookie.split("; ").find(value => value.startsWith(`${CONSENT_COOKIE}=`))?.slice(CONSENT_COOKIE.length + 1)); }
  catch { return null; }
}

export function PrivacyButton({ className }: { className?: string }) {
  const open = useContext(PrivacyContext);
  const enhanced = useSyncExternalStore(subscribe, client, server);
  return enhanced && open ? <button type="button" className={className} onClick={event => open(event.currentTarget)}>Cookie preferences</button>
    : <Link className={className} href="/cookies">Cookie information</Link>;
}

export default function CookieConsent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return children;
  return <PublicConsent>{children}</PublicConsent>;
}

function PublicConsent({ children }: { children: ReactNode }) {
  const enhanced = useSyncExternalStore(subscribe, client, server);
  const [choice, setChoice] = useState(readChoice);
  const [notice, setNotice] = useState(!choice);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(choice?.optional ?? false);
  const [status, setStatus] = useState("");
  const [focusRequest, setFocusRequest] = useState<{ target: "return" | "reopen" } | null>(null);
  const shell = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const reopen = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const previousOverflow = useRef<string | null>(null);
  const animations = useRef<Set<Animation>>(new Set());

  const unlockScroll = () => {
    if (previousOverflow.current !== null) document.body.style.overflow = previousOverflow.current;
    previousOverflow.current = null;
  };
  useEffect(() => {
    mounted.current = true;
    const activeAnimations = animations.current;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const finish = () => activeAnimations.forEach(animation => { if (animation.playState === "running") animation.finish(); });
    const visibility = () => { if (document.hidden) finish(); };
    const preference = () => { if (media.matches) finish(); };
    window.addEventListener("resize", finish);
    document.addEventListener("visibilitychange", visibility);
    media.addEventListener("change", preference);
    return () => {
      mounted.current = false;
      activeAnimations.forEach(animation => animation.cancel());
      activeAnimations.clear();
      unlockScroll();
      window.removeEventListener("resize", finish);
      document.removeEventListener("visibilitychange", visibility);
      media.removeEventListener("change", preference);
    };
  }, []);
  useEffect(() => {
    if (!focusRequest) return;
    // Keep the final frame until React has replaced the dock, avoiding a one-frame flash.
    animations.current.forEach(animation => animation.cancel());
    animations.current.clear();
    const target = focusRequest.target === "reopen" ? reopen.current
      : trigger.current?.isConnected && !trigger.current.hidden ? trigger.current
      : dock.current?.querySelector<HTMLButtonElement>("button") ?? reopen.current;
    target?.focus({ preventScroll: true });
  }, [focusRequest]);
  useEffect(() => {
    if (!notice || !enhanced || !dock.current) return;
    const node = shell.current!;
    const resize = new ResizeObserver(([entry]) => node.style.setProperty("--dock-space", `${entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height}px`));
    resize.observe(dock.current);
    return () => { resize.disconnect(); node.style.removeProperty("--dock-space"); };
  }, [notice, enhanced]);

  const animate = (element: Element, frames: Keyframe[], options: KeyframeAnimationOptions) => {
    const animation = element.animate(frames, { ...options, fill: "forwards" });
    animations.current.add(animation);
    return animation.finished.catch(() => { /* Unmount safely cancels the pending transition. */ });
  };
  const immediate = () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.hidden;
  const leaveDialog = async () => {
    if (!dialog.current?.open || immediate()) return;
    await animate(dialog.current, [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(6px)" }],
      { duration: 160, easing: "ease-in" });
  };
  const minimize = async () => {
    if (!dock.current || !reopen.current || immediate()) return;
    const from = dock.current.getBoundingClientRect();
    const to = reopen.current.getBoundingClientRect();
    const target = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})`;
    const content = Array.from(dock.current.querySelectorAll(`.${s.copy}, .${s.actions}`));
    await Promise.all([
      ...content.map(element => animate(element, [{ opacity: 1 }, { opacity: 0 }], { duration: 100 })),
      animate(dock.current, [
        { transform: "none", transformOrigin: "0 0", borderRadius: "24px", opacity: 1 },
        { transform: target, transformOrigin: "0 0", borderRadius: `${from.width / 2}px / ${from.height / 2}px`, opacity: 1, offset: .88 },
        { transform: target, transformOrigin: "0 0", borderRadius: `${from.width / 2}px / ${from.height / 2}px`, opacity: 0 },
      ], { duration: 460, easing: "cubic-bezier(.22,1,.36,1)" }),
      animate(reopen.current, [{ visibility: "visible", opacity: 0, transform: "scale(.86)" }, { visibility: "visible", opacity: .55, transform: "scale(1)" }],
        { duration: 160, delay: 300, easing: "ease-out" }),
    ]);
  };
  const open = (source: HTMLElement) => {
    if (lock.current || dialog.current?.open) return;
    trigger.current = source;
    setDraft(choice?.optional ?? false);
    setStatus("");
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
  };
  const close = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    await leaveDialog();
    if (!mounted.current) return;
    dialog.current?.close();
    unlockScroll();
    lock.current = false;
    setBusy(false);
    setFocusRequest({ target: "return" });
  };
  const save = async (optional: boolean) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const next: Consent = { version: 2, optional, updatedAt: Date.now() };
    let remembered = false;
    try {
      document.cookie = consentCookie(next, location.protocol === "https:");
      remembered = document.cookie.split("; ").some(value => value === consentCookie(next, false).split(";")[0]);
    } catch { /* Storage restrictions must never prevent rejecting optional use. */ }
    setChoice(next);
    setDraft(optional);
    if (dialog.current?.open) {
      await leaveDialog();
      if (!mounted.current) return;
      dialog.current?.close();
      unlockScroll();
    }
    if (notice) await minimize();
    if (!mounted.current) return;
    setNotice(false);
    lock.current = false;
    setBusy(false);
    setFocusRequest({ target: "reopen" });
    setStatus(`Cookie preference saved. No optional tracking is active.${remembered ? "" : " Your browser could not save this choice; it applies for this visit."}`);
  };

  return <PrivacyContext.Provider value={open}>
    <div ref={shell} className={s.shell}>
      {enhanced && notice && <section ref={dock} className={s.dock} aria-labelledby="consent-title" aria-describedby="consent-copy" aria-busy={busy}>
        <div className={s.fabric} aria-hidden="true" />
        <div className={s.copy}>
          <h2 id="consent-title">Your privacy. Your choice.</h2>
          <p id="consent-copy">Only essential cookies are used today.<br className={s.desktopBreak} /> No optional tracking is active.</p>
        </div>
        <div className={s.actions}>
          <div className={s.equalActions}>
            <button type="button" disabled={busy} onClick={() => void save(false)}>Reject optional</button>
            <button type="button" disabled={busy} onClick={() => void save(true)}>Accept optional</button>
          </div>
          <div className={`${s.policyLinks} ${s.dockLinks}`}>
            <Link href="/privacy">Privacy</Link><Link href="/cookies">Cookies</Link>
            <button type="button" className={s.textButton} disabled={busy} onClick={event => open(event.currentTarget)}>Preferences</button>
          </div>
        </div>
      </section>}
      {children}
      <p className={s.srOnly} role="status" aria-live="polite">{status}</p>
      {enhanced && <button ref={reopen} type="button" onClick={event => open(event.currentTarget)} className={s.reopen} data-docked={!notice}
        aria-label="Cookie preferences" title="Cookie preferences" aria-hidden={notice} tabIndex={notice ? -1 : 0} disabled={busy || notice}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M20.8 12.7A9 9 0 1 1 11.3 3a4 4 0 0 0 5.1 5.1 3.6 3.6 0 0 0 4.4 4.6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="8" cy="9" r="1" fill="currentColor" /><circle cx="7" cy="15" r="1" fill="currentColor" /><circle cx="13" cy="12" r="1" fill="currentColor" /><circle cx="14" cy="17" r="1" fill="currentColor" />
        </svg>
      </button>}
      {enhanced && <dialog ref={dialog} className={s.dialog} aria-labelledby="preferences-title" aria-describedby="preferences-description"
        onCancel={event => { event.preventDefault(); void close(); }} onClose={unlockScroll}
        onKeyDown={event => {
          if (event.key !== "Tab") return;
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]"));
          const first = controls[0], last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
        <button type="button" className={s.close} onClick={() => void close()} disabled={busy} aria-label="Close preferences without saving">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
        <div className={s.fabric} aria-hidden="true" />
        <div className={s.introduction}>
          <h2 id="preferences-title">Make yourself comfortable.</h2>
          <p id="preferences-description">Your choice, at any time.<br />Nothing optional runs today.</p>
          <div className={s.policyLinks}><Link href="/privacy" onClick={() => { dialog.current?.close(); unlockScroll(); }}>Privacy</Link><Link href="/cookies" onClick={() => { dialog.current?.close(); unlockScroll(); }}>Cookies</Link></div>
        </div>
        <div className={s.settings}>
          <div className={s.setting}><div><h3>Essential</h3><p>Remembers your privacy choice.</p></div><span>Always on</span></div>
          <div className={s.setting}><div><h3 id="optional-label">Optional cookies</h3><p id="optional-description">No optional services are currently in use.</p></div>
            <button type="button" role="switch" aria-checked={draft} aria-labelledby="optional-label" aria-describedby="optional-description" className={s.switch} disabled={busy} onClick={() => setDraft(value => !value)}><span /></button>
          </div>
          <p className={s.explanation}>We’ll ask again before introducing an optional service. Accepting now does not enable tracking.</p>
          <div className={s.equalActions}>
            <button type="button" disabled={busy} onClick={() => void save(false)}>Reject optional</button>
            <button type="button" disabled={busy} onClick={() => void save(true)}>Accept optional</button>
          </div>
          <button type="button" className={s.save} disabled={busy} onClick={() => void save(draft)}>Save preferences</button>
          <p className={s.savedState}>{choice ? `Saved preference: optional cookies ${choice.optional ? "accepted" : "rejected"}.` : "No preference saved. Optional cookies stay off."}</p>
        </div>
      </dialog>}
    </div>
  </PrivacyContext.Provider>;
}
