import type { Metadata } from "next";
import Navigation from "../components/halenn/cinematic/Navigation";
import { ActionLink } from "../components/halenn/cinematic/Action";
import SiteFooter from "../components/SiteFooter";
import styles from "./about.module.css";

const description = "Meet Halenn, part of Aevell. Experience in startups, scale-ups, leadership and consultancy shapes our approach to websites, apps and AI automation.";

export const metadata: Metadata = {
  title: "About",
  description,
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About Halenn | A considered next step",
    description,
    url: "https://halenn.com/about",
    siteName: "Halenn",
    type: "website",
    images: [{ url: "/brand/halenn-ribbon-v1.png", width: 1536, height: 1024, alt: "Halenn silver ribbon logo" }],
  },
};

export default function AboutPage() {
  return <div className={styles.page}>
    <a className={styles.skip} href="#about-content">Skip to content</a>
    <Navigation page="about" />
    <main id="about-content" tabIndex={-1}>
      <section className={styles.hero} aria-labelledby="about-title">
        <div>
          <p className={styles.eyebrow}>About Halenn</p>
          <h1 id="about-title">A considered<br /> <span>next step.</span></h1>
        </div>
        <div className={styles.introduction}>
          <p className={styles.lead}>Halenn creates websites, apps and AI automation for businesses ready to move forward.</p>
          <p>We help businesses present themselves clearly, make things easier for their customers and spend less time on repetitive work. Thoughtful design and practical technology are at the heart of what we do.</p>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="experience-title">
        <h2 id="experience-title">Experience behind<br /> the work.</h2>
        <div className={styles.copy}>
          <p>The two people behind Halenn each bring years of experience in startups and scale-ups, including leadership and management roles. We’ve worked in environments where innovation happens quickly and ideas need to become practical solutions.</p>
          <p>Our experience also includes working with consultancy firms such as Deloitte. We bring that perspective to Halenn: understanding the business behind a project, setting clear priorities and turning ideas into something useful.</p>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="approach-title">
        <h2 id="approach-title">Built around<br /> your business.</h2>
        <div className={styles.copy}>
          <p>We start by understanding what works, what takes too much time and what you want to improve.</p>
          <p>From there, we shape a focused solution with a clear scope and purpose. We use established tools where they fit, keeping the experience straightforward for the people who will use it.</p>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="aevell-title">
        <h2 id="aevell-title">Part of Aevell.</h2>
        <div className={styles.copy}>
          <p>Aevell is our parent company. Within Aevell, Halenn focuses on websites, apps and automation that help businesses take their next step.</p>
        </div>
      </section>
      <section className={styles.contact} aria-labelledby="about-contact-title">
        <h2 id="about-contact-title">What’s next for<br /> your business?</h2>
        <p>You don’t need a technical brief. Just tell us what you’d like to improve.</p>
        <ActionLink href="/#contact" plainArrow>Tell us what you have in mind</ActionLink>
      </section>
    </main>
    <SiteFooter />
  </div>;
}
