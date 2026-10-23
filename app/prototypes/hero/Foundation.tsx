/* eslint-disable @next/next/no-html-link-for-pages -- Reference destinations intentionally load a fresh document to isolate the preserved homepage and its global smooth scrolling. */
import { Arrow, Footnote, Header, Mark } from "./Shared";
import styles from "./heroes.module.css";

export default function Foundation() {
  return (
    <div className={`${styles.surface} ${styles.foundation}`} data-variant="Foundation">
      <Header />
      <main id="hero-content" tabIndex={-1} className={styles.foundationMain}>
        <div className={styles.foundationHeading}>
          <p className={styles.eyebrow}>Halenn / A digital parent company</p>
          <h1>Focused companies.<br /><span>One foundation.</span></h1>
          <p className={styles.description}>Room for every company to be itself.<br />The structure and standards to go further.</p>
        </div>
        <div className={styles.relationship}>
          <div className={styles.parentIdentity}>
            <div className={styles.parentArtwork}><Mark className={styles.artwork} priority /></div>
            <div className={styles.parentLabel}><span>HALENN</span><span>The foundation</span></div>
          </div>
          <div className={styles.connection} aria-hidden="true"><span /><i /></div>
          <a className={styles.companyIdentity} href="https://aevell.com" target="_blank" rel="noreferrer" aria-label="Visit Aevell — opens in a new tab">
            <div className={styles.companyTopline}><span>A Halenn company</span><Arrow /></div>
            <span className={styles.aevellName}>Aevell</span>
            <p>Web design, development<br />and ongoing maintenance.</p>
            <span className={styles.companyVisit}>Discover Aevell <Arrow /></span>
          </a>
        </div>
        <div className={styles.foundationBottom}>
          <p>Independent brands.<br /><span>Shared standards for lasting quality.</span></p>
          <a className={styles.textAction} href="/#companies">Explore companies <Arrow /></a>
          <a className={styles.secondaryAction} href="/#about">About Halenn <Arrow /></a>
        </div>
      </main>
      <Footnote label="A long-term view. By design." />
    </div>
  );
}
