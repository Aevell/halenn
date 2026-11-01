import { Instrument_Serif } from "next/font/google";
import localFont from "next/font/local";
import SiteFooter from "../../SiteFooter";
import CinematicMotion from "./CinematicMotion";
import { ExperienceProvider, Contact } from "./Experience";
import { ActionLink } from "./Action";
import Process from "./Process";
import Navigation from "./Navigation";
import Services from "./Services";
import Hero from "./Hero";
import Goals from "./Goals";
import Faq from "./Faq";
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
            <Goals />
            <Services />
          </Refraction>

          <Process />
          <section id="pricing-intro" className={styles.pricingIntro} aria-labelledby="pricing-intro-title">
            <span id="scope" className={styles.anchor} aria-hidden="true" />
            <div>
              <p className={styles.eyebrow}>A clearer idea of cost</p>
              <h2 id="pricing-intro-title">Find your starting price.</h2>
              <p>Explore packages and what’s included, or build an estimate around your needs. We’ll confirm the scope and final quote together.</p>
            </div>
            <ActionLink href="/pricing" quiet>Explore pricing</ActionLink>
          </section>
          <Faq />
          <Contact email={contactEmail} />
          <SiteFooter />
        </div>
      </CinematicMotion>
    </ExperienceProvider>
  );
}
