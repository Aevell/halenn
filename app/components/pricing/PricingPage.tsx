import Wordmark from "../halenn/cinematic/Wordmark";
import PricingBuilder from "./PricingBuilder";
import { EstimateToggle, EstimateRequirement, ExtraPages } from "./EstimateControls";
import type { GuideAnswers } from "../halenn/solution-guide";
import Disclosure from "./Disclosure";
import { PricingAtmosphere, PricingMotion } from "./PricingAtmosphere";
import {
  projects,
  extras,
  visibilityPackages, visibilityIds, automationPackages, packageIds, pillars, pillarIds, automationTerms, automationExclusions,
  carePlans, extraIds,
  exclusions,
  money,
  type Selection,
  appPlatforms, appPlatformIds, appCarePlans, appLimitations, appPublishing,
  languageScope, translationTerms, pageDescription,
} from "./catalog";
import s from "./pricing.module.css";

function PriceGuide() {
  return (
    <section id="guide" className={s.guide} aria-labelledby="guide-title">
      <PricingAtmosphere scene="guide" />
      <h2 id="guide-title" className={s.srOnly}>Service prices.</h2>
      <nav className={s.guideNav} aria-label="Browse services"><a href="#web-guide">Web</a><a href="#apps-title">App</a><a href="#automation-guide">AI Automation</a><a href="#builder">Your estimate</a></nav>
      <section id="web-guide" className={s.webGuide} aria-labelledby="web-title">
        <div className={s.serviceIntro}><h3 id="web-title">Web</h3><p>Get found. Give people a clear way to choose your business.</p></div>
      {(["website", "webshop"] as const).map((id) => (
        <article className={s.serviceBand} key={id}>
          <div>
            <h4>{projects[id].name}</h4>
            <p>
              {id === "website"
                ? "A professional website to represent your business."
                : "An online store to sell your products."}
            </p>
            <p className={s.scope}>{projects[id].scope.join(". ")}.</p>
          </div>
          <div className={s.priceAction}>
            <p className={s.servicePrice}><span>From</span>{money(projects[id].price)}<span>one-time</span></p>
            <EstimateToggle action={{ kind: "web", id }} label={projects[id].name} />
          </div>
        </article>
      ))}
      <p className={s.includedLanguages}>Included for website pages: translation writing and setup for up to two additional languages. {translationTerms}</p>
      <EstimateRequirement service="web" />
      <div className={s.guideColumns}>
        <section aria-labelledby="extras-title">
          <h3 id="extras-title">Add what you need.</h3>
          <p>Optional additions, scoped around your project.</p>
          <dl className={s.extrasMenu}>
            {extraIds.map((id) => (
              <div className={s.menuRow} key={id}>
                <dt>{extras[id].name}</dt>
                <dd className={s.menuPrice}>{extras[id].price === null ? "Quoted separately" : money(extras[id].price)}</dd>
                <dd className={s.menuAction}><EstimateToggle action={{ kind: "extra", id }} label={extras[id].name} /></dd>
              </div>
            ))}
          </dl>
          <ExtraPages />
          <Disclosure className={s.scopeDetails} title="What do the extras cover?">
            <dl>
              <div><dt>Extra pages</dt><dd>{pageDescription}</dd></div>
              <div><dt>Included languages</dt><dd>{languageScope}. {translationTerms}</dd></div>
              {Object.values(extras).map((item) => (
                <div key={item.name}>
                  <dt>{item.name}</dt>
                  <dd>{item.description}</dd>
                </div>
              ))}
            </dl>
          </Disclosure>
        </section>
        <section aria-labelledby="care-title">
          <h3 id="care-title">Care, after launch.</h3>
          <p>Optional monthly care for your website or webshop.</p>
          <dl className={s.careMenu}>
            {(["care", "plus"] as const).map((id) => (
              <div className={s.menuRow} key={id}>
                <dt>{carePlans[id].name}</dt>
                <dd className={s.menuPrice}>
                  {money(carePlans[id].price)}
                  <span>/ month</span>
                </dd>
                <dd className={s.menuDetail}>
                  {carePlans[id].scope.join(". ")}.
                </dd>
                <dd className={s.menuAction}><EstimateToggle action={{ kind: "care", id }} label={carePlans[id].name} /></dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <section className={s.visibilityGuide} aria-labelledby="visibility-title">
        <h4 id="visibility-title">More ways to get found.</h4>
        <p>Optional visibility packages. Each starting price covers a one-time setup.</p>
        <dl>{visibilityIds.map(id => <div className={s.menuRow} key={id}>
          <dt>{visibilityPackages[id].name}</dt><dd className={s.menuPrice}>From {money(visibilityPackages[id].price)}</dd>
          <dd className={s.menuDetail}>{visibilityPackages[id].description} {visibilityPackages[id].scope.join(". ")}.</dd>
          <dd className={s.menuAction}><EstimateToggle action={{ kind: "visibility", id }} label={visibilityPackages[id].name} /></dd>
        </div>)}</dl>
      </section>
      </section>
      <p className={s.costNote}>{exclusions}</p>
      <section className={s.appGuide} aria-labelledby="apps-title">
        <div className={s.appGuideIntro}>
          <h3 id="apps-title">App</h3>
          <p>Native apps, with a focused scope and a clear starting price.</p>
          <p className={s.scope}>{projects.app.scope.join(". ")}.</p>
        </div>
        <table className={s.appTable}>
          <caption className={s.srOnly}>App platform starting prices, excluding VAT</caption>
          <thead><tr><th scope="col">Platform</th><th scope="col">What you get</th><th scope="col">One-time</th></tr></thead>
          <tbody>{appPlatformIds.map(id => <tr key={id}>
            <th scope="row">{appPlatforms[id].name}</th>
            <td>{appPlatforms[id].description}</td>
            <td><div className={s.priceAction}><span>From {money(appPlatforms[id].price)}</span><EstimateToggle action={{ kind: "app", id }} label={appPlatforms[id].name} /></div></td>
          </tr>)}</tbody>
        </table>
        <div className={s.appCareGuide}>
          <div><h4>Optional App Care</h4><p>{appCarePlans.app.description} New features are quoted separately.</p></div>
          <div className={s.priceAction}><p>{money(appCarePlans.app.price)} <span>/ month</span></p><EstimateToggle action={{ kind: "appCare" }} label="App Care" /></div>
        </div>
        <EstimateRequirement service="app" />
        <Disclosure className={s.scopeDetails} title="App scope and getting ready to publish">
          <p>{appLimitations}</p><p>{appPublishing}</p>
          <p>Store-account fees, hosting, backend services, paid APIs and other third-party subscriptions are separate. All prices exclude VAT.</p>
        </Disclosure>
      </section>
      <section id="automation-guide" className={s.aiGuide} aria-labelledby="automation-title">
        <div className={s.serviceIntro}>
          <h3 id="automation-title">AI Automation</h3>
          <p>Choose the job you want handled. No website or app purchase required.</p>
          <p className={s.help}>Starting prices for one-time setup. Automation and AI are used where they fit the task.</p>
        </div>
        {pillarIds.map(pillar => <section className={s.pillarGuide} key={pillar} aria-labelledby={`pillar-${pillar}`}>
          <div><h4 id={`pillar-${pillar}`}>{pillars[pillar].name}</h4><p>{pillars[pillar].description}</p></div>
          <dl>{packageIds.filter(id => automationPackages[id].pillar === pillar).map(id => <div className={s.menuRow} key={id}>
            <dt>{automationPackages[id].name}</dt><dd className={s.menuPrice}>From {money(automationPackages[id].price)}</dd>
            <dd className={s.menuDetail}>{automationPackages[id].description}<span className={s.packageScope}>{automationPackages[id].scope.join(". ")}.</span></dd>
            <dd className={s.menuAction}><EstimateToggle action={{ kind: "automation", id }} label={automationPackages[id].name} /></dd>
          </div>)}</dl>
        </section>)}
        <div className={s.customGuide}>
          <div><h4>Custom automation</h4><p>A connected workflow, a specific AI task or something that does not fit these packages. Tell us what you need and we’ll scope it with you.</p></div>
          <div className={s.priceAction}><p>Quote required</p><EstimateToggle action={{ kind: "customAutomation" }} label="Custom automation" /></div>
        </div>
        <p className={s.costNote}>{automationExclusions}</p>
        <p className={s.help}>{automationTerms}</p>
      </section>
    </section>
  );
}

const faqs = [
  ["Can I combine Web, App and AI Automation?", "Yes. Add any combination from the price list to your estimate. Each service is itemised once, with optional website and app care listed separately. We review shared work and connections between services before confirming a proposal."],
  ["Do I need a new website for automation?", "No. Add any automation package on its own. We confirm whether your current phone, booking system and other tools support the connections before starting."],
  ["What is included in an automation price?", `The listed one-time setup and scope. ${automationExclusions} ${automationTerms}`],
  ["Are additional languages included?", `${languageScope}. ${translationTerms}`],
  ["Who publishes my app?", appPublishing],
  [
    "Is this a fixed quote?",
    "No. These are indicative starting estimates. We discuss your requirements and confirm the scope and price in a proposal before work starts.",
  ],
  [
    "What if I need something different?",
    "Tell us what you have in mind. Custom integrations and changes beyond the listed scope are quoted separately. You can also start small and add to the project later.",
  ],
  [
    "Are there other ongoing costs?",
    "Hosting, domains, payment fees, platform subscriptions and AI usage are separate. We identify the services your project needs in the proposal. Website and app care are optional. Automation support is quoted separately. App store-account fees are also separate.",
  ],
  [
    "How do timing and payment work?",
    "Delivery dates, payment terms, ownership and cancellation terms are confirmed in the proposal. The starting estimate does not set contractual terms.",
  ],
];
function Questions() {
  return (
    <section
      className={s.questions}
      id="questions"
      aria-labelledby="questions-title"
    >
      <h2 id="questions-title">A little more clarity.</h2>
      <div>
        {faqs.map(([question, answer]) => (
          <Disclosure key={question} title={question} icon>
            <p>{answer}</p>
          </Disclosure>
        ))}
      </div>
    </section>
  );
}

export default function PricingPage({ initial, prototype = false, guideAnswers }: { initial: Selection; prototype?: boolean; guideAnswers?: GuideAnswers }) {
  const home = prototype ? "/prototypes/hero?v=1" : "/";
  return (
    <div className={s.page}>
      <PricingMotion />
      <a href="#guide" className={s.skip}>
        Skip to prices
      </a>
      <header className={s.header}>
        <a
          className={s.brand}
          href={`${home}#hero-content`}
          aria-label="Halenn home"
        >
          <Wordmark />
          <span>A company by Aevell</span>
        </a>
        <nav aria-label="Main navigation">
          <a href={`${home}#services`}>Services</a>
          <a href="#guide" aria-current="page">
            Pricing
          </a>
          <a href="#contact">Contact</a>
        </nav>
      </header>
      <main>
        <section className={s.intro} aria-labelledby="pricing-title">
          <PricingAtmosphere scene="intro" />
          <h1 id="pricing-title">Find your starting price.</h1>
          <p>Clear packages. An estimate you can build as you browse.</p>
          <p className={s.draftNotice}>
            {prototype ? "Prototype pricing. " : ""}Starting estimates, excluding VAT.
          </p>
        </section>
        <noscript>
          <div className={s.noScript}>
            Browse all prices and scopes below. To combine services in an estimate, enable JavaScript, or email{" "}
            <a href="mailto:contact@halenn.com">contact@halenn.com</a>.
          </div>
          <style>{`[data-pricing-interactive] { display: none !important; }`}</style>
        </noscript>
        <PricingBuilder
          initial={initial}
          guideAnswers={guideAnswers}
          guide={<PriceGuide />}
          questions={<Questions />}
        />
      </main>
      <footer className={s.footer}>
        <Wordmark />
        <a href="https://aevell.com" target="_blank" rel="noreferrer">
          A company by Aevell
          <span className={s.srOnly}> (opens in a new tab)</span>
        </a>
        <a href="#builder">Back to your estimate</a>
      </footer>
    </div>
  );
}
