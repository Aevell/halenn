import { Instrument_Serif } from "next/font/google";
import { Arrow, Mark } from "./Shared";
import CinematicMotion from "./CinematicMotion";
import { ExperienceProvider, Projects, Process, Contact } from "./Experience";
import ProjectScope from "./ProjectScope";
import styles from "./cinematic.module.css";

const editorial = Instrument_Serif({weight:"400",style:["normal","italic"],subsets:["latin"],display:"swap",variable:"--font-editorial"});

export default function Cinematic() {
  return (
    <ExperienceProvider><CinematicMotion>
      <div className={`${styles.world} ${editorial.variable}`} data-variant="Cinematic">
        <a className={styles.skip} href="#hero-content">Skip to content</a>
        <section className={styles.opening} aria-label="Halenn introduction" data-opening>
          <div className={styles.aperture} aria-hidden="true"><i/><i/><span/></div>
          <div className={styles.atmosphere} aria-hidden="true"><i /><i /><i /></div>
          <header className={styles.header}>
            <a href="#hero-content" className={styles.wordmark} aria-label="Halenn home">HALENN<span>A company by Aevell</span></a>
            <nav aria-label="Primary navigation">
              <a href="#projects">Projects</a><a href="#contact">Contact</a>
              <a href="#scope">Build your brief <Arrow /></a>
            </nav>
          </header>
          <main id="hero-content" tabIndex={-1} className={styles.hero}>
            <div className={styles.headline} data-hero-copy>
              <p className={styles.eyebrow}><span /> Websites. Workflows. What’s next.</p>
              <h1><span><span>Built to <br className={styles.mobileBreak} />impress.</span></span><span><span>Made to work.</span></span></h1>
            </div>
            <div className={styles.artwork}><Mark priority /></div>
            <div className={styles.heroNote} data-hero-aside>
              
              <p>Distinctive websites.<br />Connected systems.<br />Care beyond the launch.</p>
            </div>
            <div className={styles.heroAction} data-hero-aside>
              
              <a className={styles.outlineLink} href="#scope">Plan your project <Arrow /></a>
            </div>
            <a className={styles.scrollCue} href="#services"><span>Scroll to go further</span><Arrow down /></a>
            
          </main>
        </section>

        <section id="services" className={styles.sequence} aria-labelledby="services-title" data-scroll-scene>
          <div className={styles.stage} data-scroll-stage>
            <div className={styles.sceneType} aria-hidden="true" data-scene-type><span>BEYOND</span><span>THE LAUNCH.</span></div>
            
            <div className={styles.frame} data-expanding-frame>
              <div className={styles.frameLight} aria-hidden="true" />
              <div className={styles.frameBar}><span>HALENN / DIGITAL SERVICES</span><span>From first impression to everyday operation <span aria-hidden="true">↗</span></span></div>
              <div className={styles.frameContent}>
                
                <h2 id="services-title">Beautiful outside.<br /><span>Connected inside.</span></h2>
                <p className={styles.frameIntro}>Websites, commerce and n8n automation — designed together, supported after launch.</p>
                <div className={styles.capabilities}>
                  <a href="#scope"><h3>Websites.</h3><p>Custom design and development. <br />Built around your business.</p><Arrow /></a>
                  <a href="#scope"><h3>Commerce.</h3><p>Webshops, carts and checkout. <br />A clear path from interest to order.</p><Arrow /></a>
                  <a href="#scope"><h3>Automation.</h3><p>n8n workflows and integrations. <br />Less repetitive work behind the scenes.</p><Arrow /></a>
                </div>

              </div>
              <div className={styles.frameFooter}><span>Launch is a starting point.</span><a href="#scope">Build your brief <Arrow /></a></div>
            </div>
            <div className={styles.progress} aria-hidden="true"><span>Explore the possibilities</span><i><b data-scroll-progress /></i><span>Keep scrolling ↓</span></div>
          </div>
        </section>

        <Projects /><Process />
        <section id="scope" className={styles.scope} aria-labelledby="scope-title">
          <div className={styles.scopeHeading}><h2 id="scope-title">What do you<br /><span>have in mind?</span></h2><p>Start with the essentials. Add the capabilities your business needs. We’ll shape the scope around the work.</p></div>
          <ProjectScope />
        </section>
        <Contact />
        <footer className={styles.footer}><span className={styles.wordmark}>HALENN</span><p>Websites & systems, thoughtfully connected.</p><a href="https://aevell.com" target="_blank" rel="noreferrer">Part of Aevell <span className={styles.srOnly}>(opens in a new tab)</span><Arrow /></a></footer>
      </div>
    </CinematicMotion></ExperienceProvider>
  );
}
