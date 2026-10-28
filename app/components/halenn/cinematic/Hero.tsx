import Image from "next/image";
import { Arrow } from "../Brand";
import { ActionLink } from "./Action";
import RibbonLight from "./RibbonLight";
import Wordmark from "./Wordmark";
import s from "./hero.module.css";

export default function Hero() {
  return <div id="hero-content" tabIndex={-1} className={s.track} data-opening-track>
    <section className={s.opening} aria-label="Halenn introduction" data-opening>
      <div className={s.aperture} aria-hidden="true"><i /><i /><Wordmark className={s.introWord} /></div>
      <main className={s.hero}>
        <div className={s.content}>
          <div className={s.heroAction} data-hero-aside><ActionLink href="#scope" plainArrow>Plan your project</ActionLink></div>
          <div className={s.description} data-hero-copy>
            <h1>Websites. Commerce. Connected systems.</h1>
            <p>Made to work beautifully.</p>
          </div>
        </div>
        <div className={s.artwork}>
          <RibbonLight>
            <Image src="/brand/halenn-ribbon-2x.webp" width={1536} height={1024} alt="" aria-hidden="true" unoptimized loading="eager" fetchPriority="high" draggable={false} />
          </RibbonLight>
        </div>
        <a className={s.scrollCue} href="#services"><span>Scroll to go further</span><Arrow down /></a>
      </main>
    </section>
  </div>;
}
