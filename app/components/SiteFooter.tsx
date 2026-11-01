import Link from "next/link";
import { PrivacyButton } from "./legal/CookieConsent";
import { legalLinks } from "./legal/documents";
import Wordmark from "./halenn/cinematic/Wordmark";
import styles from "./site-footer.module.css";

export default function SiteFooter({ contained = false }: { contained?: boolean }) {
  return (
    <footer id="footer" className={`${styles.footer} ${contained ? styles.contained : ""}`}>
      <div className={styles.main}>
        <div className={styles.identity}>
          <Link href="/#hero-content" className={styles.brand} aria-label="Halenn home">
            <Wordmark />
          </Link>
          <a className={styles.email} href="mailto:contact@halenn.com">contact@halenn.com</a>
        </div>
        <nav className={styles.group} aria-label="Footer navigation">
          <p className={styles.label}>Explore</p>
          <ul>
            <li><Link href="/#services">Services</Link></li>
            <li><Link href="/pricing">Pricing</Link></li>
            <li><Link href="/about">About</Link></li>
            <li><Link href="/#process">How we work</Link></li>
            <li><Link href="/#faq">FAQ</Link></li>
            <li><Link href="/#contact">Contact</Link></li>
          </ul>
        </nav>
        <div className={styles.group}>
          <p className={styles.label}>Information</p>
          <ul>
            {legalLinks.map(([slug, label]) => <li key={slug}><Link href={`/${slug}`}>{label}</Link></li>)}
            <li><PrivacyButton className={styles.preferences} /></li>
          </ul>
        </div>
      </div>
      <div className={styles.bottom}>
        <p>© {new Date().getFullYear()} Halenn</p>
        <a href="https://aevell.com" target="_blank" rel="noreferrer">
          Part of Aevell <span aria-hidden="true">↗</span>
          <span className={styles.srOnly}> (opens in a new tab)</span>
        </a>
      </div>
    </footer>
  );
}
