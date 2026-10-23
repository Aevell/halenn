/* eslint-disable @next/next/no-html-link-for-pages -- Reference destinations intentionally load a fresh document to isolate the preserved homepage and its global smooth scrolling. */
import Image from "next/image";
import styles from "./heroes.module.css";

export function Mark({ className = "", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      className={className}
      src="/prototypes/halenn-original.png"
      width={1774}
      height={887}
      alt=""
      aria-hidden="true"
      unoptimized
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      draggable={false}
    />
  );
}

export function Arrow({ down = false }: { down?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d={down ? "M10 3v14m-5-5 5 5 5-5" : "M4 10h12m-5-5 5 5-5 5"} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Header({ wordmark = false }: { wordmark?: boolean }) {
  return (
    <>
      <a className={styles.skipLink} href="#hero-content">Skip to content</a>
      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="Halenn home">
          {!wordmark && <Mark className={styles.headerMark} />}
          <span>HALENN</span>
        </a>
        <nav className={styles.navigation} aria-label="Primary navigation">
          <a href="/#companies">Companies</a>
          <a href="/#principles">Principles</a>
          <a href="/#about">About</a>
        </nav>
      </header>
    </>
  );
}

export function Actions({ quiet = false }: { quiet?: boolean }) {
  return (
    <div className={styles.actions}>
      <a className={quiet ? styles.textAction : styles.primaryAction} href="/#companies">
        Explore companies <Arrow />
      </a>
      <a className={styles.secondaryAction} href="/#about">About Halenn <Arrow /></a>
    </div>
  );
}

export function Footnote({ label }: { label: string }) {
  return (
    <footer className={styles.footnote}>
      <span>{label}</span>
      <span>Amsterdam, NL <span className={styles.locationDot} aria-hidden="true" /></span>
    </footer>
  );
}
