import { Instrument_Serif } from "next/font/google";
import localFont from "next/font/local";
import { Arrow, Mark } from "./Brand";
import CinematicMotion from "./CinematicMotion";
import LogoPortal from "./LogoPortal";
import { ExperienceProvider, Projects, Process, Contact } from "./Experience";
import ProjectScope from "./ProjectScope";
import styles from "./cinematic.module.css";

const editorial = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-editorial",
});

const display = localFont({
  src: [
    {
      path: "./fonts/BarlowCondensed-Medium.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/BarlowCondensed-SemiBold.ttf",
      weight: "600",
      style: "normal",
    },
  ],
  display: "swap",
  variable: "--font-cinematic",
});

export default function Cinematic({ contactEmail }: { contactEmail?: string }) {
  return (
    <ExperienceProvider>
      <CinematicMotion>
        <div
          className={`${styles.world} ${editorial.variable} ${display.variable}`}
          data-variant="Cinematic"
        >
          <a className={styles.skip} href="#hero-content">
            Skip to content
          </a>
          <div className={styles.openingTrack} data-opening-track>
            <section
              className={styles.opening}
              aria-label="Halenn introduction"
              data-opening
            >
              <div className={styles.aperture} aria-hidden="true">
                <i />
                <i />
                <span className={styles.introWord}>HALENN.</span>
              </div>
              <div className={styles.atmosphere} aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <header className={styles.header}>
                <a
                  href="#hero-content"
                  className={styles.wordmark}
                  aria-label="Halenn home"
                >
                  HALENN<span>A company by Aevell</span>
                </a>
                <nav aria-label="Primary navigation">
                  <a href="#projects">Projects</a>
                  <a href="#contact">Contact</a>
                  <a href="#scope">
                    Build your brief <Arrow />
                  </a>
                </nav>
              </header>
              <main id="hero-content" tabIndex={-1} className={styles.hero}>
                <div className={styles.headline} data-hero-copy>
                  <h1>
                    <span>Built to</span>
                    <span>impress.</span>
                  </h1>
                  <p className={styles.heroDescription}>
                    Websites. Commerce. Connected systems.
                    <br />
                    Made to work beautifully.
                  </p>
                </div>
                <div className={styles.artwork}>
                  <LogoPortal>
                    <Mark priority highResolution />
                  </LogoPortal>
                </div>

                <div className={styles.heroAction} data-hero-aside>
                  <a className={styles.outlineLink} href="#scope">
                    Plan your project <Arrow />
                  </a>
                </div>
                <a className={styles.scrollCue} href="#services">
                  <span>Scroll to go further</span>
                  <Arrow down />
                </a>
              </main>
            </section>
          </div>

          <section
            id="services"
            tabIndex={-1}
            className={styles.sequence}
            aria-labelledby="services-title"
            data-scroll-scene
          >
            <div className={styles.stage} data-scroll-stage>
              <div
                className={styles.sceneType}
                aria-hidden="true"
                data-scene-type
              >
                <span>BEYOND</span>
                <span>THE LAUNCH.</span>
              </div>

              <div className={styles.serviceCamera} data-service-camera>
                <div className={styles.frame} data-expanding-frame>
                  <div className={styles.frameLight} aria-hidden="true" />
                  <div className={styles.frameBar}>
                    <span>HALENN / DIGITAL SERVICES</span>
                    <span>
                      From first impression to everyday operation{" "}
                      <span aria-hidden="true">↗</span>
                    </span>
                  </div>
                  <div className={styles.frameContent}>
                    <h2 id="services-title">
                      Beautiful outside.
                      <br />
                      <span>Connected inside.</span>
                    </h2>
                    <p className={styles.frameIntro}>
                      Websites, commerce and n8n automation. Designed together,
                      supported after launch.
                    </p>
                    <div className={styles.capabilities}>
                      <a href="#scope">
                        <h3>Websites.</h3>
                        <p>
                          Custom design and development. <br />
                          Built around your business.
                        </p>
                        <Arrow />
                      </a>
                      <a href="#scope">
                        <h3>Commerce.</h3>
                        <p>
                          Webshops, carts and checkout. <br />A clear path from
                          interest to order.
                        </p>
                        <Arrow />
                      </a>
                      <a href="#scope">
                        <h3>Automation.</h3>
                        <p>
                          n8n workflows and integrations. <br />
                          Less repetitive work behind the scenes.
                        </p>
                        <Arrow />
                      </a>
                    </div>
                  </div>
                  <div className={styles.frameFooter}>
                    <span>Launch is a starting point.</span>
                    <a href="#scope">
                      Build your brief <Arrow />
                    </a>
                  </div>
                </div>
              </div>
              <div
                className={styles.progress}
                aria-hidden="true"
                data-scene-progress
              >
                <span>Explore the possibilities</span>
                <i>
                  <b data-scroll-progress />
                </i>
                <span>Keep scrolling ↓</span>
              </div>
            </div>
          </section>

          <Projects />
          <Process />
          <section
            id="scope"
            className={styles.scope}
            aria-labelledby="scope-title"
          >
            <div className={styles.scopeHeading} data-scope-heading>
              <h2 id="scope-title">
                Your idea.
                <br />
                <span>Our next move.</span>
              </h2>
              <p>
                Start with the essentials. Add the capabilities your business
                needs. We’ll shape the scope around the work.
              </p>
            </div>
            <ProjectScope />
          </section>
          <Contact email={contactEmail} />
          <footer className={styles.footer}>
            <span className={styles.wordmark}>HALENN</span>
            <p>Websites & systems, thoughtfully connected.</p>
            <a href="https://aevell.com" target="_blank" rel="noreferrer">
              Part of Aevell{" "}
              <span className={styles.srOnly}>(opens in a new tab)</span>
              <Arrow />
            </a>
          </footer>
        </div>
      </CinematicMotion>
    </ExperienceProvider>
  );
}
