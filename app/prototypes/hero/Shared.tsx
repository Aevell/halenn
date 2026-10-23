import Image from "next/image";
import styles from "./heroes.module.css";

export function Mark({ className = "", priority = false, highResolution = false }: {
  className?: string;
  priority?: boolean;
  highResolution?: boolean;
}) {
  return (
    <Image
      className={className}
      src={highResolution ? "/prototypes/halenn-original-2x.png" : "/prototypes/halenn-original.png"}
      width={highResolution ? 3548 : 1774}
      height={highResolution ? 1774 : 887}
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
        <a className={styles.brand} href="/prototypes/hero?v=1" aria-label="Halenn prototype home">
          {!wordmark && <Mark className={styles.headerMark} />}
          <span>HALENN</span>
        </a>
        <nav className={styles.navigation} aria-label="Primary navigation">
          <a href="/prototypes/hero?v=1#services">Services</a>
          <a href="/prototypes/hero?v=1#scope">Project brief</a>
          <a href="https://aevell.com">Aevell</a>
        </nav>
      </header>
    </>
  );
}

export function Actions({ quiet = false }: { quiet?: boolean }) {
  return (
    <div className={styles.actions}>
      <a className={quiet ? styles.textAction : styles.primaryAction} href="/prototypes/hero?v=1#services">
        Explore services <Arrow />
      </a>
      <a className={styles.secondaryAction} href="https://aevell.com">Part of Aevell <Arrow /></a>
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
