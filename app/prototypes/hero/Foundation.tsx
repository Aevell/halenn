import { Arrow, Footnote, Header, Mark } from "./Shared";
import styles from "./heroes.module.css";

export default function Foundation() {
  return (
    <div className={`${styles.surface} ${styles.foundation}`} data-variant="Foundation">
      <Header />
      <main id="hero-content" tabIndex={-1} className={styles.foundationMain}>
        <div className={styles.foundationHeading}>
          <p className={styles.eyebrow}>Halenn / A company by Aevell</p>
          <h1>Your website.<br /><span>Connected to more.</span></h1>
          <p className={styles.description}>Custom websites, webshops and n8n workflows.<br />Ongoing care to keep everything moving.</p>
        </div>
        <div className={styles.relationship}>
          <div className={styles.parentIdentity}>
            <div className={styles.parentArtwork}><Mark className={styles.artwork} priority /></div>
            <div className={styles.parentLabel}><span>HALENN</span><span>Websites & automation</span></div>
          </div>
          <div className={styles.connection} aria-hidden="true"><span /><i /></div>
          <a className={styles.companyIdentity} href="https://aevell.com" target="_blank" rel="noreferrer" aria-label="Visit Aevell (opens in a new tab)">
            <div className={styles.companyTopline}><span>The parent company</span><Arrow /></div>
            <span className={styles.aevellName}>Aevell</span>
            <p>The parent company<br />behind Halenn.</p>
            <span className={styles.companyVisit}>Discover Aevell <Arrow /></span>
          </a>
        </div>
        <div className={styles.foundationBottom}>
          <p>Design. Development. Automation.<br /><span>One connected digital presence.</span></p>
          <a className={styles.textAction} href="/prototypes/hero?v=1#services">Explore services <Arrow /></a>
          <a className={styles.secondaryAction} href="/prototypes/hero?v=1#scope">Build your brief <Arrow /></a>
        </div>
      </main>
      <Footnote label="A long-term view. By design." />
    </div>
  );
}
