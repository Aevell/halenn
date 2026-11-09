import Link from "next/link";
import Wordmark from "../halenn/cinematic/Wordmark";
import LegalFooter from "./LegalFooter";
import { PrivacyButton } from "./CookieConsent";
import { legalLinks, type LegalDocument as Document } from "./documents";
import s from "./legal.module.css";

function LinkArrow() {
  return <svg className={s.arrow} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12" stroke="currentColor" strokeWidth="1.5" /></svg>;
}

export default function LegalDocument({ document, slug }: { document: Document; slug: string }) {
  return <div className={s.page}>
    <a href="#legal-content" className={s.skip}>Skip to document</a>
    <header className={s.header}><Link href="/" aria-label="Halenn home"><Wordmark /></Link><Link href="/">Back to Halenn <LinkArrow /></Link></header>
    <main id="legal-content" tabIndex={-1}>
      <div className={s.hero}>
        <h1>{document.title}</h1><p>{document.description}</p>
        <nav aria-label="Legal documents" className={s.tabs}>{legalLinks.map(([id, label]) => <Link key={id} href={`/${id}`} aria-current={id === slug ? "page" : undefined}>{label}</Link>)}</nav>
      </div>
      <div className={s.document}>
        <aside><nav aria-label="On this page"><p>On this page</p>{document.sections.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}</nav><p className={s.date}>Updated<br /><time dateTime={slug === "privacy" || slug === "cookies" ? "2026-11-09" : "2026-11-01"}>{slug === "privacy" || slug === "cookies" ? "9 November 2026" : "1 November 2026"}</time></p><PrivacyButton /></aside>
        <article>{document.sections.map(section => <section key={section.id} id={section.id} className={s.section}>
          <h2>{section.title}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          {section.items && <ul>{section.items.map(item => <li key={item}>{item}</li>)}</ul>}
        </section>)}
        </article>
      </div>
      <section className={s.contact}><h2>Clarity starts with a conversation.</h2><a href="mailto:contact@halenn.com">contact@halenn.com <LinkArrow /></a></section>
    </main>
    <LegalFooter />
  </div>;
}
