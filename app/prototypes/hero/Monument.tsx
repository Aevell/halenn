import { Actions, Footnote, Header, Mark } from "./Shared";
import styles from "./heroes.module.css";

export default function Monument() {
  return (
    <div className={`${styles.surface} ${styles.monument}`} data-variant="Monument">
      <Header wordmark />
      <main id="hero-content" tabIndex={-1} className={styles.monumentMain}>
        <div className={styles.monumentLight} aria-hidden="true" />
        <p className={styles.monumentOverline}>Independent thinking. Enduring value.</p>
        <div className={styles.monumentArtwork}><Mark className={styles.artwork} priority /></div>
        <div className={styles.monumentCopy}>
          <p className={styles.eyebrow}>Halenn · A digital parent company</p>
          <h1>A parent company<br /><span>for what comes next.</span></h1>
          <p className={styles.description}>We create and grow focused digital companies.<br className={styles.desktopBreak} /> Strong products. Distinct identities. A long-term view.</p>
          <Actions />
        </div>
      </main>
      <Footnote label="Building enduring digital businesses" />
    </div>
  );
}
