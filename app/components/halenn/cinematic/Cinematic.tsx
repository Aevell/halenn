import { Instrument_Serif } from "next/font/google";
import localFont from "next/font/local";
import { Arrow } from "../Brand";
import CinematicMotion from "./CinematicMotion";
import { ExperienceProvider, Projects, Process, Contact } from "./Experience";
import ProjectScope from "./ProjectScope";
import Navigation from "./Navigation";
import Services from "./Services";
import Hero from "./Hero";
import Wordmark from "./Wordmark";
import Refraction from "./Refraction";
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
      path: "../fonts/BarlowCondensed-Medium.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../fonts/BarlowCondensed-SemiBold.ttf",
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
          <Navigation />
          <Refraction>
            <Hero />
            <Services />
          </Refraction>

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
                Project pricing starts with a clear scope. Choose your essentials
                and we’ll put together a tailored quote, including any ongoing care.
              </p>
            </div>
            <ProjectScope />
          </section>
          <Contact email={contactEmail} />
          <footer className={styles.footer}>
            <Wordmark className={styles.footerWordmark} />
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
