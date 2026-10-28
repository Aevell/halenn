import { Actions, Footnote, Header, Mark } from "./Shared";
import styles from "./heroes.module.css";

export default function Editorial() {
  return (
    <div className={`${styles.surface} ${styles.editorial}`} data-variant="Editorial">
      <Header />
      <main id="hero-content" tabIndex={-1} className={styles.editorialMain}>
        <div className={styles.editorialCopy}>
          <p className={`${styles.eyebrow} ${styles.editorialEnter}`}>A company by Aevell / Amsterdam</p>
          <h1 className={styles.editorialEnter}>Built to<br />impress.<br /><span>Made<br />to work.</span></h1>
          <div className={`${styles.editorialIntro} ${styles.editorialEnter}`}>
            <span className={styles.editorialDash} aria-hidden="true" />
            <p>Custom websites, commerce and n8n workflows. Halenn brings your digital presence together and keeps it moving after launch.</p>
          </div>
          <div className={styles.editorialEnter}><Actions quiet /></div>
        </div>
        <div className={styles.editorialVisual}>
          <div className={styles.editorialHalo} aria-hidden="true" />
          <Mark className={styles.artwork} priority />
          <p className={styles.artCaption}>Considered design.<br /><span>Connected systems.</span></p>
        </div>
      </main>
      <Footnote label="Websites · Commerce · Automation · Care" />
    </div>
  );
}
