import styles from "./heroes.module.css";
import { Mark, Arrow } from "../../components/halenn/Brand";
export { Mark, Arrow };

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
