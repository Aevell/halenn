"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Disclosure from "./Disclosure";
import { PricingAtmosphere } from "./PricingAtmosphere";
import {
  projects, services, serviceIds, webTypeIds, extras, extraIds,
  visibilityPackages, visibilityIds, automationPackages, packageIds, pillars, pillarIds,
  carePlans, careIds, estimate, money, toggleService, stagesFor, selectionError,
  parseSelection, serializeSelection, createBriefModel, investmentLabel, emptyNotes,
  enquiryHref, examples, appPlatforms, appPlatformIds, appCarePlans, appCareIds,
  appLimitations, appPublishing, languageScope, translationTerms, automationExclusions,
  pagePrice, maxExtraPages, pageDescription, disclaimer,
  type Selection, type ServiceId, type ExtraId, type Stage, type CustomNotes,
} from "./catalog";
import s from "./pricing.module.css";

const titles: Record<Stage, string> = {
  project: "What can we help you with?",
  webType: "What kind of website?",
  extras: "What else should your website do?",
  automation: "Where would a little help go furthest?",
  care: "Would you like ongoing care?",
  platform: "Where should your app live?",
  review: "Here’s your starting point.",
};
function Arrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 12h15m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Choice({
  name,
  title,
  description,
  price,
  checked,
  onChange,
  checkbox = false,
  compact = false,
  expanded, controls,
}: {
  name: string;
  title: string;
  description?: string;
  price: string;
  checked: boolean;
  onChange: () => void;
  checkbox?: boolean;
  compact?: boolean;
  expanded?: boolean;
  controls?: string;
}) {
  return (
    <label
      className={`${s.choice} ${compact ? s.compactChoice : ""}`}
      data-selected={checked || undefined}
    >
      <input
        type={checkbox ? "checkbox" : "radio"}
        name={name}
        checked={checked}
        onChange={onChange}
        {...(controls ? { "aria-expanded": expanded, "aria-controls": controls } : {})}
      />
      <span className={s.choiceText}>
        <strong>{title}</strong>
        {description && <span>{description}</span>}
      </span>
      <span className={s.choicePrice}>{price}</span>
      <span className={s.indicator} aria-hidden="true">
        <svg viewBox="0 0 20 20" width="20" height="20" fill="none">
          <path
            d="m4 10 4 4 8-8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </label>
  );
}
function CustomRequirements({ selected, description, onToggle, onDescription, automation = false }: {
  automation?: boolean; selected: boolean; description: string; onToggle: () => void; onDescription: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className={s.customRequirements}>
      <Choice compact checkbox name={automation ? "custom-automation" : "custom-web"} title={automation ? "Custom automation" : "Custom web requirements"} description={automation ? "A different workflow, an AI task, or help choosing the right approach." : undefined} price="Quote required"
        checked={selected} onChange={onToggle} expanded={selected} controls={id} />
      <div className={s.customExpansion} data-open={selected} id={id} inert={!selected} aria-hidden={!selected}>
        <div>
          <label className={s.customField}>
            Tell us what you have in mind <span>(optional)</span>
            <textarea rows={4} maxLength={500} value={description} disabled={!selected}
              aria-describedby={`${id}-count`} onChange={event => onDescription(event.target.value.slice(0, 500))} />
          </label>
          <p id={`${id}-count`} className={s.characterCount}>{description.length} / 500 characters</p>
        </div>
      </div>
    </div>
  );
}
function LineItems({ selection }: { selection: Selection }) {
  return (
    <ul className={s.lineItems}>
      {estimate(selection).lines.map((line) => (
        <li key={line.id}>
          <span>{line.name}</span>
          <span>
            {line.price === null ? "Quote required" : money(line.price)}
          </span>
        </li>
      ))}
    </ul>
  );
}
export default function PricingBuilder({
  initial,
  guide,
  questions,
}: {
  initial: Selection;
  guide: ReactNode;
  questions: ReactNode;
}) {
  const [selection, setSelection] = useState(initial);
  const [customNotes, setCustomNotes] = useState<CustomNotes>(emptyNotes);
  const [stage, setStage] = useState<Stage>("project");
  const [notice, setNotice] = useState("");
  const [shared, setShared] = useState("");
  const [shareFallback, setShareFallback] = useState("");
  const [draftOpened, setDraftOpened] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const exportPending = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const transitioning = useRef(false);
  const previousHeight = useRef(0);
  const direction = useRef(1);
  const animations = useRef<Animation[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const builder = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const shareField = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const result = createBriefModel(selection, customNotes);
  const selectionKey = serializeSelection(selection);
  const activeQuery = useRef(selectionKey);
  const web = selection.services.includes("web");
  const app = selection.services.includes("app");
  const ai = selection.services.includes("automation");
  const stages = stagesFor(selection);
  const step = stages.indexOf(stage);
  const questionCount = stages.length - 1;

  useEffect(() => {
    activeQuery.current = selectionKey;
    history.replaceState(
      history.state,
      "",
      `${location.pathname}?${selectionKey}${location.hash}`,
    );
  }, [selectionKey]);
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(location.search);
      const query: Record<string, string | string[]> = {};
      params.forEach((_, key) => {
        const values = params.getAll(key);
        query[key] = values.length === 1 ? values[0] : values;
      });
      const restored = parseSelection(query);
      if (serializeSelection(restored) === activeQuery.current) return;
      setSelection(restored);
      animations.current.forEach((animation) => animation.cancel());
      transitioning.current = false;
      shell.current?.style.removeProperty("overflow");
      if (panel.current) panel.current.inert = false;
      builder.current?.removeAttribute("aria-busy");
      setStage("project");
      setNotice("");
      setShared("");
      setShareFallback("");
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const focusStep = () => heading.current?.focus({ preventScroll: true });
  const positionQuestion = () => {
    const top = heading.current?.getBoundingClientRect().top ?? 0;
    if (top < 24 || top > window.innerHeight * 0.6)
      builder.current?.scrollIntoView({ block: "start", behavior: "instant" });
  };
  useLayoutEffect(() => {
    if (!transitioning.current || !panel.current || !shell.current) return;
    const frame = shell.current;
    const content = panel.current;
    // Hold the old fade until React commits the replacement, then measure before paint.
    animations.current.forEach(animation => animation.cancel());
    animations.current = [];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finish = () => {
      animations.current.forEach((animation) => animation.cancel());
      animations.current = [];
      transitioning.current = false;
      frame.style.removeProperty("overflow");
      content.inert = false;
      builder.current?.removeAttribute("aria-busy");
      focusStep();
    };
    if (reduced) { finish(); return; }
    frame.style.overflow = "clip";
    content.inert = true;
    const resize = frame.animate([
      { height: `${previousHeight.current}px` },
      { height: `${frame.getBoundingClientRect().height}px` },
    ], { duration: 280, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    const entrance = content.animate([
      { opacity: 0, transform: `translateX(${direction.current * 14}px)` },
      { opacity: 1, transform: "translateX(0)" },
    ], { duration: 240, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
    animations.current = [resize, entrance];
    resize.onfinish = finish;
  }, [stage]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const settle = () => {
      if (media.matches) animations.current.forEach((animation) => animation.finish());
    };
    media.addEventListener("change", settle);
    return () => {
      animations.current.forEach((animation) => animation.cancel());
      media.removeEventListener("change", settle);
    };
  }, []);
  const navigate = (next: Stage) => {
    if (transitioning.current || !next) return;
    if (stage === next) { positionQuestion(); focusStep(); return; }
    setNotice("");
    positionQuestion();
    transitioning.current = true;
    builder.current?.setAttribute("aria-busy", "true");
    if (panel.current) panel.current.inert = true;
    previousHeight.current = shell.current?.getBoundingClientRect().height ?? 0;
    direction.current = stages.indexOf(next) > step ? 1 : -1;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !panel.current) {
      setStage(next);
      return;
    }
    const exit = panel.current.animate([
      { opacity: 1, transform: "translateX(0)" },
      { opacity: 0, transform: `translateX(${-direction.current * 10}px)` },
    ], { duration: 90, easing: "ease-in", fill: "forwards" });
    animations.current = [exit];
    exit.onfinish = () => setStage(next);
  };
  const update = (next: Selection) => {
    if (transitioning.current) return;
    setSelection(next);
    if (!exportPending.current) setPdfStatus("idle");
    setNotice("");
    setShared("");
    setShareFallback("");
  };
  const chooseService = (id: ServiceId) => {
    if (transitioning.current) return;
    const { selection: next, removed } = toggleService(selection, id);
    update(next);
    if (removed) setNotice(`${removed} removed from this estimate. Its answers are kept if you add it again during this visit.`);
  };
  const toggleExtra = (id: ExtraId) =>
    update({
      ...selection,
      extras: selection.extras.includes(id)
        ? selection.extras.filter((value) => value !== id)
        : [...selection.extras, id],
    });
  const share = async () => {
    const url = `${location.origin}${location.pathname}?${selectionKey}#builder`;
    setShareFallback(url);
    try {
      await navigator.clipboard.writeText(url);
      setShared("Estimate link copied. It contains only your selections.");
    } catch {
      setShareFallback(url);
      setShared("Copy the estimate link below.");
      requestAnimationFrame(() => {
        shareField.current?.focus();
        shareField.current?.select();
      });
    }
  };
  const download = async () => {
    if (exportPending.current) return;
    exportPending.current = true;
    const snapshot = createBriefModel(selection, customNotes);
    setPdfStatus("loading");
    try {
      const { downloadBriefPdf } = await import("./brief-pdf");
      await downloadBriefPdf(snapshot);
      setPdfStatus("success");
    } catch {
      setPdfStatus("error");
    } finally {
      exportPending.current = false;
    }
  };
  const openEnquiry = () => {
    returnFocus.current = document.activeElement as HTMLElement;
    setDraftOpened(false);
    dialog.current?.showModal();
  };
  const monthlyLabel = result.monthlyLines.length
    ? `${result.monthlyLines.map(line => line.name).join(" + ")}: ${money(result.monthly)}/month`
    : ai && !web && !app ? "Automation support quoted separately" : "No monthly care selected";
  const updateNote = (key: keyof CustomNotes, value: string) => {
    if (transitioning.current) return;
    setCustomNotes(previous => ({ ...previous, [key]: value }));
    if (!exportPending.current) setPdfStatus("idle");
  };
  const custom = <CustomRequirements selected={selection.extras.includes("custom")} description={customNotes.web}
    onToggle={() => toggleExtra("custom")} onDescription={value => updateNote("web", value)} />;
  const continueStep = () => {
    if (transitioning.current) return;
    const error = selectionError(selection, stage);
    if (error) { setNotice(error); return; }
    navigate(stages[step + 1]);
  };

  return (
    <>
      <section
        id="builder"
        ref={builder}
        className={s.builder}
        aria-label="Guided pricing walkthrough"
        data-pricing-interactive
      >
        <div className={s.progress}>
          <span>
            {stage === "review"
              ? "Your estimate"
              : !selection.services.length ? "Choose your services" : `Question ${step + 1} of ${questionCount}`}
          </span>
          <div aria-hidden="true">
            {stages
              .filter((item) => item !== "review")
              .map((item, i) => (
                <span key={item} data-complete={i <= step || undefined} />
              ))}
          </div>
        </div>
        <div ref={shell} className={s.panelShell}>
        <div ref={panel} className={s.panel} key={stage}>
          <h2 ref={heading} tabIndex={-1}>
            {titles[stage]}
          </h2>
          {stage === "project" && (
            <>
              <p className={s.panelIntro}>
                Select one or more. We’ll bring everything into one estimate.
              </p>
              <fieldset className={`${s.projectChoices} ${s.projectTypes}`}>
                <legend className={s.srOnly}>Services, select one or more</legend>
                {serviceIds.map((id) => (
                  <Choice
                    key={id}
                    name="services"
                    checkbox
                    title={services[id].name}
                    description={services[id].description}
                    price={`From ${money(services[id].startingPrice)}`}
                    checked={selection.services.includes(id)}
                    onChange={() => chooseService(id)}
                  />
                ))}
              </fieldset>
            </>
          )}
          {stage === "webType" && (
            <>
              <p className={s.panelIntro}>A place to introduce your business, or a shop to sell online.</p>
              <fieldset className={`${s.projectChoices} ${s.twoChoices}`}>
                <legend className={s.srOnly}>Website type</legend>
                {webTypeIds.map(id => <Choice key={id} name="web-type" title={projects[id].name}
                  description={projects[id].description} price={`From ${money(projects[id].price)}`}
                  checked={selection.webType === id} onChange={() => update({ ...selection, webType: id })} />)}
              </fieldset>
              <p className={s.help}>Both include up to five pages and two additional languages. Webshop also includes up to 20 products, cart and checkout.</p>
            </>
          )}
          {stage === "extras" && (
            <>
              <p className={s.panelIntro}>
                Pick any extras, or continue with the essentials.
              </p>
              <fieldset className={s.extraChoices}>
                <legend className={s.srOnly}>Optional website extras</legend>
                {extraIds.filter(id => id !== "custom").map((id) => (
                  <Choice
                    key={id}
                    compact
                    checkbox
                    name={id}
                    title={extras[id].name}
                    price={
                      extras[id].price === null
                        ? "Quote required"
                        : `+${money(extras[id].price)}`
                    }
                    checked={selection.extras.includes(id)}
                    onChange={() => toggleExtra(id)}
                  />
                ))}
              </fieldset>
              <div className={s.pageQuantity}>
                <div><label htmlFor="extra-pages">Extra pages</label><p>{money(pagePrice)} per page, beyond the five included.</p></div>
                <div className={s.quantityControls}>
                  <button aria-label="Remove an extra page" disabled={selection.extraPages === 0} onClick={() => update({ ...selection, extraPages: selection.extraPages - 1 })}>−</button>
                  <input id="extra-pages" type="number" min={0} max={maxExtraPages} step={1} value={selection.extraPages}
                    onChange={event => { const n = Number(event.target.value); if (Number.isInteger(n) && n >= 0 && n <= maxExtraPages) update({ ...selection, extraPages: n }); }} />
                  <button aria-label="Add an extra page" disabled={selection.extraPages === maxExtraPages} onClick={() => update({ ...selection, extraPages: selection.extraPages + 1 })}>+</button>
                </div>
                <span className={s.pageSubtotal}>{money(selection.extraPages * pagePrice)}</span>
              </div>
              {selection.extraPages === maxExtraPages && <p className={s.help}>Need more than 20 extra pages? Tell us under Custom web requirements.</p>}
              <Disclosure className={s.packageGroup} title={<span>Get found <small>{selection.visibility.length ? `${selection.visibility.length} selected` : "Optional visibility packages"}</small></span>} icon>
                <p className={s.help}>Make your business easier to discover. Basic technical SEO is already included in your website.</p>
                <fieldset className={s.extraChoices}>
                  <legend className={s.srOnly}>Get found packages</legend>
                  {visibilityIds.map(id => <Choice key={id} compact checkbox name={id}
                    title={visibilityPackages[id].name} description={visibilityPackages[id].description}
                    price={`From ${money(visibilityPackages[id].price)}`} checked={selection.visibility.includes(id)}
                    onChange={() => update({ ...selection, visibility: selection.visibility.includes(id) ? selection.visibility.filter(value => value !== id) : [...selection.visibility, id] })} />)}
                </fieldset>
              </Disclosure>
              {custom}
              <p className={s.help}>Up to two additional languages, including translation writing, are included for your website pages.</p>
              {selection.webType === "webshop" && (
                <p className={s.help}>
                  Cart, checkout and one payment integration are already
                  included.
                </p>
              )}
              <Disclosure className={s.scopeDetails} title="What is included in each extra?">
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
            </>
          )}
          {stage === "automation" && (
            <>
              <p className={s.panelIntro}>Explore an area, then select the packages you need. You can combine them.</p>
              <div className={s.packageGroups}>
                {pillarIds.map(pillar => {
                  const ids = packageIds.filter(id => automationPackages[id].pillar === pillar);
                  const selected = ids.filter(id => selection.automationPackages.includes(id));
                  return <Disclosure key={pillar} className={s.packageGroup} icon
                    title={<span>{pillars[pillar].name}<small>{selected.length ? `${selected.length} selected · ${money(selected.reduce((total, id) => total + automationPackages[id].price, 0))}` : pillars[pillar].description}</small></span>}>
                    <fieldset className={s.automationChoices}>
                      <legend className={s.srOnly}>{pillars[pillar].name} packages</legend>
                      {ids.map(id => <Choice key={id} compact checkbox name={id} title={automationPackages[id].name}
                        description={automationPackages[id].description} price={`From ${money(automationPackages[id].price)}`}
                        checked={selection.automationPackages.includes(id)}
                        onChange={() => update({ ...selection, automationPackages: selection.automationPackages.includes(id) ? selection.automationPackages.filter(value => value !== id) : [...selection.automationPackages, id] })} />)}
                    </fieldset>
                    <Disclosure className={s.scopeDetails} title="See the starting scopes">
                      <dl>{ids.map(id => <div key={id}><dt>{automationPackages[id].name}</dt><dd>{automationPackages[id].scope.join(". ")}.</dd></div>)}</dl>
                    </Disclosure>
                  </Disclosure>;
                })}
              </div>
              <CustomRequirements automation selected={selection.customAutomation} description={customNotes.automation}
                onToggle={() => update({ ...selection, customAutomation: !selection.customAutomation })}
                onDescription={value => updateNote("automation", value)} />
              <p className={s.help}>{automationExclusions}</p>
            </>
          )}
          {stage === "care" && (
            <>
              <p className={s.panelIntro}>Care is optional. The monthly amount stays separate from your build.</p>
              {web && <div className={s.supportGroup}>
                <h3>Website care</h3>
                <fieldset className={s.projectChoices}>
                  <legend className={s.srOnly}>Optional website care</legend>
                  {careIds.map(id => <Choice key={id} name="care" title={carePlans[id].name} description={carePlans[id].description}
                    price={id === "none" ? "No care added" : `${money(carePlans[id].price)} / month`}
                    checked={selection.care === id} onChange={() => update({ ...selection, care: id })} />)}
                </fieldset>
              </div>}
              {app && <div className={s.supportGroup}>
                <h3>App care</h3>
                <fieldset className={`${s.projectChoices} ${s.twoChoices}`}>
                  <legend className={s.srOnly}>Optional app care</legend>
                  {appCareIds.map(id => <Choice key={id} name="appCare" title={appCarePlans[id].name} description={appCarePlans[id].description}
                    price={id === "none" ? "No care added" : `${money(appCarePlans[id].price)} / month`}
                    checked={selection.appCare === id} onChange={() => update({ ...selection, appCare: id })} />)}
                </fieldset>
              </div>}
              <p className={s.help}>Hosting, subscriptions and new features are separate.{ai && " Automation support is quoted separately."}</p>
            </>
          )}
          {stage === "platform" && (
            <>
              <p className={s.panelIntro}>One core journey, up to five screens. Choose the platform your customers use.</p>
              <fieldset className={s.projectChoices}>
                <legend className={s.srOnly}>App platform</legend>
                {appPlatformIds.map(id => <Choice key={id} name="platform" title={appPlatforms[id].name}
                  description={appPlatforms[id].description} price={`From ${money(appPlatforms[id].price)}`}
                  checked={selection.appPlatform === id} onChange={() => update({ ...selection, appPlatform: id })} />)}
              </fieldset>
              <Disclosure className={s.scopeDetails} title="What does the app package include?">
                <dl><div><dt>A focused app</dt><dd>{projects.app.scope.join(". ")}. Both platforms include the same functionality.</dd></div>
                  <div><dt>Beyond the starting scope</dt><dd>{appLimitations}</dd></div>
                  <div><dt>Getting it into the stores</dt><dd>{appPublishing}</dd></div></dl>
              </Disclosure>
            </>
          )}
          {stage === "review" && (
            <>
              <p className={s.panelIntro}>
                Your {result.projectName} project, itemised below. Final scope is agreed together.
              </p>
              <div
                className={s.reviewTotals}
                key={`${result.oneTime}-${result.monthly}`}
              >
                <div>
                  <span>One-time starting investment</span>
                  <strong>{investmentLabel(result)}</strong>
                  {result.quoteRequired && (
                    <p>{result.oneTime ? "Plus custom work, quoted separately." : "We’ll scope and price this with you."}</p>
                  )}
                </div>
                <div>
                  <span>Ongoing support</span>
                  {result.monthly > 0 ? (
                    <>
                      <strong>
                        {money(result.monthly)}
                        <small> / month</small>
                      </strong>
                      <p>{result.monthlyLines.map(line => line.name).join(" + ")}</p>
                    </>
                  ) : (
                    <p>{monthlyLabel}</p>
                  )}
                </div>
              </div>
              <Disclosure className={s.estimateDetails} title="What’s in this estimate?">
                <LineItems selection={selection} />
                {result.lines.map(line => <p key={line.id}><strong>{line.name}:</strong> {line.scope.join(". ")}.</p>)}
                {result.monthlyLines.map(line => <p key={line.id}><strong>{line.name}, {money(line.price ?? 0)}/month:</strong> {line.scope.join(". ")}.</p>)}
                {Object.entries(result.customNotes).map(([key, note]) => note && <p key={key} className={s.customNote}><strong>Your {key === "web" ? "web" : "automation"} requirements:</strong> {note}</p>)}
                {result.notes.filter(note => !note.startsWith("Ongoing automation")).map(note => <p key={note}>{note}</p>)}
                <p>{result.exclusions}</p>
                <p>{disclaimer}</p>
              </Disclosure>
              <div className={s.reviewActions}>
                <button className={s.primary} onClick={openEnquiry}>
                  Discuss this project <Arrow />
                </button>
                <button className={s.secondary} onClick={download} aria-disabled={pdfStatus === "loading"}>
                  {pdfStatus === "loading" ? "Preparing PDF…" : pdfStatus === "error" ? "Retry PDF download" : "Download PDF brief"}
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <button
                  className={s.textButton}
                  onClick={() => navigate("project")}
                >
                  Edit answers
                </button>
              </div>
              <p className={s.feedback} role="status" aria-live="polite">
                {pdfStatus === "loading" ? "Preparing your branded brief." : pdfStatus === "success" ? "Your PDF is ready. Check your downloads. Nothing has been submitted." : pdfStatus === "error" ? "The PDF could not be prepared. Please retry, or discuss your project by email." : ""}
              </p>
              <Disclosure className={s.saveDetails} title="Share your estimate">
                <p>Shared links contain your selections, but not written notes.</p>
                <div>
                  <button className={s.textButton} onClick={share}>
                    Copy estimate link <Arrow />
                  </button>
                </div>
                <p role="status" className={s.feedback}>
                  {shared}
                </p>
                {shareFallback && (
                  <label className={s.shareFallback}>
                    Estimate link
                    <input
                      ref={shareField}
                      readOnly
                      value={shareFallback}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                  </label>
                )}
              </Disclosure>
              <p className={s.help}>
                Excluding VAT, hosting and third-party costs. Nothing has been
                submitted.
              </p>
            </>
          )}
        </div>
        </div>
        <p className={s.selectionNotice} role="status">
          {notice}
        </p>
        {stage !== "review" && (
          <div className={s.stepActions}>
            <div>
              {step > 0 && (
                <button
                  className={s.textButton}
                  onClick={() => navigate(stages[step - 1])}
                >
                  Back
                </button>
              )}
            </div>
            <button
              className={s.primary}
              onClick={continueStep}
            >
              {stage !== "project" && step === questionCount - 1 ? "See my estimate" : "Continue"}
              <Arrow />
            </button>
          </div>
        )}
        <p className={s.srOnly} role="status" aria-atomic="true">
          {investmentLabel(result)}{result.oneTime > 0 ? " one-time" : ""}. {monthlyLabel}.{" "}
          {result.quoteRequired
            ? "Additional custom work requires a quote."
            : ""}
        </p>
        <a className={s.browseLink} href="#guide">
          Or explore the full price guide below{" "}
          <span aria-hidden="true">
            <Arrow />
          </span>
        </a>
      </section>
      {guide}
      <section className={s.examples} aria-label="Example project budgets">
        <Disclosure title="See a few example budgets" icon>
          <p className={s.help}>
            Illustrative combinations you can use as a starting point.
          </p>
          <div className={s.exampleList}>
            {examples.map((example) => {
              const totals = estimate(example.selection);
              return (
                <article key={example.name}>
                  <h3>{example.name}</h3>
                  <p>{example.description}</p>
                  <p className={s.exampleBreakdown}>{example.breakdown}</p>
                  <strong>From {money(totals.oneTime)}</strong>
                  <span>
                    {totals.monthly
                      ? `Optional ${money(totals.monthly)}/month ${totals.monthlyLines.map(line => line.name).join(" + ")}`
                      : "Support quoted separately"}
                  </span>
                  <button
                    className={s.textButton}
                    data-pricing-interactive
                    onClick={() => {
                      if (transitioning.current) return;
                      update(example.selection);
                      setCustomNotes(emptyNotes);
                      navigate("review");
                      setNotice(
                        `${example.name} loaded. You can change any answer.`,
                      );
                    }}
                  >
                    Use this starting point <Arrow />
                  </button>
                </article>
              );
            })}
          </div>
        </Disclosure>
      </section>
      {questions}
      <section
        className={s.contact}
        id="contact"
        aria-labelledby="contact-title"
      >
        <PricingAtmosphere scene="contact" />
        <h2 id="contact-title">
          Let’s build something
          <br />
          that works.
        </h2>
        <p>Tell us what you have in mind.</p>
        <div>
          <button
            className={s.primary}
            onClick={openEnquiry}
            data-pricing-interactive
          >
            Discuss your project <Arrow />
          </button>
          <a href="mailto:contact@halenn.com">contact@halenn.com</a>
        </div>
      </section>
      <dialog
        ref={dialog}
        onClose={() => returnFocus.current?.focus({ preventScroll: true })}
        className={s.dialog}
        aria-labelledby="enquiry-title"
      >
        <button
          className={s.close}
          onClick={() => dialog.current?.close()}
          aria-label="Close enquiry"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="m6 6 12 12M18 6 6 18"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <h2 id="enquiry-title">Tell us what’s next.</h2>
        <p>Your estimate and any custom requirements will be included in an email draft.</p>
        <div className={s.enquirySummary}>
          <strong>{investmentLabel(result)}{result.oneTime > 0 ? " one-time" : ""}</strong>
          <span>{monthlyLabel}</span>
          {result.quoteRequired && (
            <span>Custom work requires an additional quote.</span>
          )}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            window.location.href = enquiryHref(
              selection,
              String(data.get("name")),
              String(data.get("email")),
              String(data.get("message")),
              customNotes,
            );
            setDraftOpened(true);
          }}
        >
          <label>
            Your name
            <input name="name" autoComplete="name" required maxLength={100} />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
          <label>
            What do you have in mind?
            <textarea name="message" rows={3} required maxLength={1800} />
          </label>
          <button className={s.primary} type="submit">
            Open email draft <Arrow />
          </button>
          <p className={s.help}>
            Nothing is sent automatically. Send your enquiry from your email
            app.
          </p>
          {draftOpened && (
            <p role="status">
              Complete your enquiry in your email app. If it did not open, email{" "}
              <a href="mailto:contact@halenn.com">contact@halenn.com</a>{" "}
              directly.
            </p>
          )}
        </form>
      </dialog>
    </>
  );
}
