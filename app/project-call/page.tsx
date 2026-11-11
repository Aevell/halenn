import type { Metadata } from "next";
import Navigation from "../components/halenn/cinematic/Navigation";
import { ActionLink } from "../components/halenn/cinematic/Action";
import SiteFooter from "../components/SiteFooter";
import styles from "./project-call.module.css";

export const metadata: Metadata = {
  title: "Your project call",
  robots: { index: false, follow: false },
};

export default function ProjectCallPage() {
  return <div className={styles.page}>
    <Navigation page="project-call" />
    <main className={styles.content}>
      <p className={styles.eyebrow}>Optional project call</p>
      <h1>Let’s continue<br /><span>the conversation.</span></h1>
      <p>Online booking isn’t available from this link at the moment.</p>
      <p>If you’ve already sent an enquiry, we’ll still follow up by email. You can arrange a 30-minute call when we reply.</p>
      <ActionLink href="/" plainArrow>Back to Halenn</ActionLink>
    </main>
    <SiteFooter />
  </div>;
}
