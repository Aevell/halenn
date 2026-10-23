import { Actions, Footnote, Header, Mark } from "./Shared";
import styles from "./heroes.module.css";

export default function Editorial() {
  return (
    <div className={`${styles.surface} ${styles.editorial}`} data-variant="Editorial">
      <Header />
      <main id="hero-content" tabIndex={-1} className={styles.editorialMain}>
        <div className={styles.editorialCopy}>
          <p className={`${styles.eyebrow} ${styles.editorialEnter}`}>A digital parent company / Amsterdam</p>
          <h1 className={styles.editorialEnter}>Built to<br />compound.<br /><span>Designed<br />to endure.</span></h1>
          <div className={`${styles.editorialIntro} ${styles.editorialEnter}`}>
            <span className={styles.editorialDash} aria-hidden="true" />
            <p>We create and grow focused digital companies with strong products, distinct identities and a long-term view.</p>
          </div>
          <div className={styles.editorialEnter}><Actions quiet /></div>
        </div>
        <div className={styles.editorialVisual}>
          <div className={styles.editorialHalo} aria-hidden="true" />
          <Mark className={styles.artwork} priority />
          <p className={styles.artCaption}>Independent identities.<br /><span>A shared standard.</span></p>
        </div>
      </main>
      <Footnote label="Positioning · Product · Design · Technology" />
    </div>
  );
}
