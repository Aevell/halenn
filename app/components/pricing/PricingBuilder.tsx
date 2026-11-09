"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Disclosure from "./Disclosure";
import { PricingAtmosphere } from "./PricingAtmosphere";
import { EstimateProvider } from "./EstimateControls";
import {
  normalizeSelection,
  serializeSelection,
  createBriefModel,
  investmentLabel,
  emptyNotes,
  buildBrief,
  examples,
  estimate,
  estimateTitle,
  money,
  disclaimer,
  type Selection,
  type CustomNotes,
  type EstimateLine,
} from "./catalog";
import {
  actionSelected,
  applyEstimateAction,
  emptySelection,
  parseBrowsingSelection,
  removeEstimateLine,
  type EstimateAction,
} from "./estimate-selection";
import {
  guideBrief,
  parseGuideAnswers,
  type GuideAnswers,
} from "../halenn/solution-guide";
import s from "./pricing.module.css";
import useSmartTabTitle from "../useSmartTabTitle";
import {
  enquiryReceivedMessage,
  useEnquirySubmission,
} from "../../lib/enquiry-client";

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

export default function PricingBuilder({
  initial,
  guideAnswers,
  guide,
  questions,
}: {
  initial: Selection;
  guideAnswers?: GuideAnswers;
  guide: ReactNode;
  questions: ReactNode;
}) {
  const [selection, setSelection] = useState(initial);
  const [customNotes, setCustomNotes] = useState<CustomNotes>(emptyNotes);
  const [guideContext, setGuideContext] = useState(guideAnswers);
  const [notice, setNotice] = useState("");
  const [reviewVisible, setReviewVisible] = useState(false);
  const [shared, setShared] = useState("");
  const [shareFallback, setShareFallback] = useState("");
  const submission = useEnquirySubmission();
  const enquiryForm = useRef<HTMLFormElement>(null);
  const [pdfStatus, setPdfStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const exportPending = useRef(false);
  const builder = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const contact = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const shareField = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const guideText = guideContext ? guideBrief(guideContext) : "";
  const baseResult = createBriefModel(selection, customNotes);
  const result = {
    ...baseResult,
    notes: guideText ? [...baseResult.notes, guideText] : baseResult.notes,
  };
  const hasItems = result.lines.length > 0;
  useSmartTabTitle(
    estimateTitle(result),
    hasItems
      ? "Your estimate is waiting | Halenn"
      : "Let’s plan your next step | Halenn",
  );
  const count = result.lines.length + result.monthlyLines.length;
  const selectionQuery =
    selection.services.length || guideContext
      ? serializeSelection(selection) +
        (guideContext
          ? `&guide=${encodeURIComponent(JSON.stringify(guideContext))}`
          : "")
      : "";
  const activeQuery = useRef(selectionQuery);
  const monthlyLabel = result.monthlyLines.length
    ? `${money(result.monthly)}/month optional care`
    : selection.services.includes("automation")
      ? "No monthly care selected. Automation support quoted separately."
      : "No monthly care selected";

  useEffect(() => {
    activeQuery.current = selectionQuery;
    const current = new URLSearchParams(location.search);
    const next = new URLSearchParams(selectionQuery);
    // Keep campaign attribution when estimate changes rewrite the URL.
    for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
      const value = current.get(key);
      if (value && value.length <= 160) next.set(key, value);
    }
    const query = next.toString();
    history.replaceState(
      history.state,
      "",
      `${location.pathname}${query ? `?${query}` : ""}${location.hash}`,
    );
  }, [selectionQuery]);
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(location.search);
      const query: Record<string, string | string[]> = {};
      params.forEach((_, key) => {
        const values = params.getAll(key);
        query[key] = values.length === 1 ? values[0] : values;
      });
      const restored = parseBrowsingSelection(query);
      const restoredGuide = parseGuideAnswers(params.get("guide") ?? undefined);
      const restoredQuery =
        restored.services.length || restoredGuide
          ? serializeSelection(restored) +
            (restoredGuide
              ? `&guide=${encodeURIComponent(JSON.stringify(restoredGuide))}`
              : "")
          : "";
      if (restoredQuery === activeQuery.current) return;
      setSelection(restored);
      setGuideContext(restoredGuide);
      setCustomNotes(emptyNotes);
      setNotice("");
      setShared("");
      setShareFallback("");
      if (!exportPending.current) setPdfStatus("idle");
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  useEffect(() => {
    const visible = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) =>
          entry.isIntersecting
            ? visible.add(entry.target)
            : visible.delete(entry.target),
        );
        setReviewVisible(visible.size > 0);
      },
      { rootMargin: "0px 0px -140px 0px" },
    );
    if (builder.current) observer.observe(builder.current);
    if (contact.current) observer.observe(contact.current);
    return () => observer.disconnect();
  }, []);

  const update = (next: Selection) => {
    const normalized = normalizeSelection(next);
    setSelection(normalized);
    setCustomNotes((previous) => ({
      web: normalized.extras.includes("custom") ? previous.web : "",
      automation: normalized.customAutomation ? previous.automation : "",
    }));
    setShared("");
    setShareFallback("");
    if (!exportPending.current) setPdfStatus("idle");
  };
  const onAction = (action: EstimateAction, label: string) => {
    const removing = actionSelected(selection, action);
    const next = applyEstimateAction(selection, action);
    update(next);
    const message =
      action.kind === "pages"
        ? `${next.extraPages} extra pages selected.`
        : removing && (action.kind === "web" || action.kind === "app")
          ? `${label} and its associated extras and care removed.`
          : `${label} ${removing ? "removed from" : "added to"} your estimate.`;
    setNotice(`${message} ${investmentLabel(estimate(next))}.`);
  };
  const review = () => {
    builder.current?.scrollIntoView({ block: "start", behavior: "instant" });
    heading.current?.focus({ preventScroll: true });
  };
  const remove = (line: EstimateLine) => {
    update(removeEstimateLine(selection, line));
    setNotice(
      `${line.name} removed.${line.id === "website" || line.id === "webshop" || (line.id.startsWith("app-") && line.id !== "app-care") ? " Its associated extras and care were also removed." : ""}`,
    );
    heading.current?.focus({ preventScroll: true });
  };
  const share = async () => {
    const url = `${location.origin}${location.pathname}?${selectionQuery}#builder`;
    setShareFallback(url);
    try {
      await navigator.clipboard.writeText(url);
      setShared(
        "Estimate link copied. Written notes and contact details are not included.",
      );
    } catch {
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
    const snapshot = result;
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
    if (submission.open("pricing")) enquiryForm.current?.reset();
    dialog.current?.showModal();
  };
  const updateNote = (key: keyof CustomNotes, value: string) => {
    setCustomNotes((previous) => ({ ...previous, [key]: value.slice(0, 500) }));
    if (!exportPending.current) setPdfStatus("idle");
  };
  const lineList = (lines: EstimateLine[], monthly = false) => (
    <ul className={s.selectedItems}>
      {lines.map((line) => (
        <li key={line.id}>
          <span>{line.name}</span>
          <span>
            {line.price === null
              ? "Quote required"
              : `${money(line.price)}${monthly ? " / month" : ""}`}
          </span>
          <button
            className={s.removeItem}
            aria-label={`Remove ${line.name} from estimate`}
            onClick={() => remove(line)}
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <EstimateProvider selection={selection} onAction={onAction}>
      {guide}
      <p className={s.srOnly} role="status" aria-live="polite">
        {notice}
      </p>
      <section
        id="builder"
        ref={builder}
        className={s.estimateSection}
        aria-labelledby="estimate-title"
        data-pricing-interactive
      >
        <div className={s.estimateHeading}>
          <div>
            <p className={s.help}>Optional estimate</p>
            <h2 id="estimate-title" ref={heading} tabIndex={-1}>
              Your starting estimate.
            </h2>
          </div>
          {hasItems && (
            <button
              className={s.textButton}
              onClick={() => {
                update(emptySelection());
                setGuideContext(undefined);
                setCustomNotes(emptyNotes);
                setNotice("Your estimate has been cleared.");
                heading.current?.focus({ preventScroll: true });
              }}
            >
              Clear estimate
            </button>
          )}
        </div>
        {!hasItems ? (
          <div className={s.emptyEstimate}>
            <p>
              No services selected yet. Add packages from the price list to see
              them together here.
            </p>
            <a className={s.secondary} href="#guide">
              Browse prices <Arrow />
            </a>
          </div>
        ) : (
          <>
            <p className={s.panelIntro}>
              Your selected services, itemised below. We’ll confirm the final
              scope and quote with you.
            </p>
            {guideText && (
              <p className={s.guideNotice}>
                Your homepage guide choices are included. You can add packages
                from the price list or remove items here.
              </p>
            )}
            <div className={s.reviewTotals}>
              <div>
                <span>One-time starting investment</span>
                <strong>{investmentLabel(result)}</strong>
                {result.quoteRequired && (
                  <p>
                    {result.oneTime
                      ? "Plus custom work, quoted separately."
                      : "We’ll scope and price this with you."}
                  </p>
                )}
              </div>
              <div>
                <span>Optional monthly care</span>
                {result.monthly > 0 ? (
                  <>
                    <strong>
                      {money(result.monthly)}
                      <small> / month</small>
                    </strong>
                    <p>
                      {result.monthlyLines.map((line) => line.name).join(" + ")}
                    </p>
                  </>
                ) : (
                  <p>{monthlyLabel}</p>
                )}
              </div>
            </div>
            <div className={s.itemGroup}>
              <h3>One-time setup</h3>
              {lineList(result.lines)}
            </div>
            {result.monthlyLines.length > 0 && (
              <div className={s.itemGroup}>
                <h3>Optional monthly care</h3>
                {lineList(result.monthlyLines, true)}
              </div>
            )}
            <a className={s.browseEstimate} href="#guide">
              Add or change services in the price list <Arrow />
            </a>
            {(["web", "automation"] as const)
              .filter((key) =>
                key === "web"
                  ? selection.extras.includes("custom")
                  : selection.customAutomation,
              )
              .map((key) => (
                <label className={s.customField} key={key}>
                  Your custom {key === "web" ? "website" : "automation"}{" "}
                  requirements <span>(optional)</span>
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={customNotes[key]}
                    onChange={(event) => updateNote(key, event.target.value)}
                  />
                </label>
              ))}
            <Disclosure
              className={s.estimateDetails}
              title="Scope and costs to keep in mind"
            >
              {result.lines.map((line) => (
                <p key={line.id}>
                  <strong>{line.name}:</strong> {line.scope.join(". ")}.
                </p>
              ))}
              {result.monthlyLines.map((line) => (
                <p key={line.id}>
                  <strong>{line.name}:</strong> {line.scope.join(". ")}.
                </p>
              ))}
              {baseResult.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
              <p>{result.exclusions}</p>
              <p>{disclaimer}</p>
            </Disclosure>
            <div className={s.reviewActions}>
              <button className={s.primary} onClick={openEnquiry}>
                Request a quote <Arrow />
              </button>
              <button
                className={s.secondary}
                onClick={download}
                aria-disabled={pdfStatus === "loading"}
              >
                {pdfStatus === "loading"
                  ? "Preparing PDF…"
                  : pdfStatus === "error"
                    ? "Retry PDF download"
                    : "Download estimate PDF"}
              </button>
            </div>
            <p className={s.feedback} role="status">
              {pdfStatus === "loading"
                ? "Preparing your estimate."
                : pdfStatus === "success"
                  ? "Your PDF is ready. Check your downloads."
                  : pdfStatus === "error"
                    ? "The PDF could not be prepared. Please retry."
                    : ""}
            </p>
            <Disclosure className={s.saveDetails} title="Share your estimate">
              <p>
                Shared links contain selected packages and homepage guide
                choices, but not written notes or contact details.
              </p>
              <button className={s.textButton} onClick={share}>
                Copy estimate link <Arrow />
              </button>
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
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </label>
              )}
            </Disclosure>
            <p className={s.help}>
              Starting estimates exclude VAT, hosting and third-party costs.
              Final pricing is agreed in a proposal.
            </p>
          </>
        )}
        {guideText && (
          <Disclosure
            className={s.estimateDetails}
            title="Your original homepage guide answers"
          >
            <p className={s.guideAnswers}>{guideText}</p>
          </Disclosure>
        )}
      </section>
      {hasItems && !reviewVisible && (
        <div
          className={s.estimateBar}
          role="region"
          aria-label="Current estimate"
          data-pricing-interactive
        >
          <div>
            <span>
              Your estimate · {count} {count === 1 ? "item" : "items"}
            </span>
            <strong>
              {investmentLabel(result)}
              {result.oneTime > 0 && result.quoteRequired
                ? " + custom quote"
                : ""}
            </strong>
            <small>
              Excl. VAT
              {result.monthly ? ` · + ${money(result.monthly)}/month care` : ""}
            </small>
          </div>
          <button className={s.primary} onClick={review}>
            Review estimate <Arrow />
          </button>
        </div>
      )}
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
                      ? `Optional ${money(totals.monthly)}/month care`
                      : "Support quoted separately"}
                  </span>
                  <button
                    className={s.textButton}
                    data-pricing-interactive
                    onClick={() => {
                      update(example.selection);
                      setGuideContext(undefined);
                      setCustomNotes(emptyNotes);
                      setNotice(`${example.name} loaded as your estimate.`);
                      review();
                    }}
                  >
                    Use this estimate <Arrow />
                  </button>
                </article>
              );
            })}
          </div>
        </Disclosure>
      </section>
      {questions}
      <section
        ref={contact}
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
        <p>
          Tell us what you have in mind. You can enquire with or without an
          estimate.
        </p>
        <div>
          <button
            className={s.primary}
            onClick={openEnquiry}
            data-pricing-interactive
          >
            Request a quote <Arrow />
          </button>
          <a href="mailto:contact@halenn.com">contact@halenn.com</a>
        </div>
      </section>
      <dialog
        ref={dialog}
        onCancel={(event) => {
          if (submission.pending) event.preventDefault();
        }}
        onClose={() => {
          submission.close();
          returnFocus.current?.focus({ preventScroll: true });
        }}
        className={s.dialog}
        aria-labelledby="enquiry-title"
      >
        <button
          className={s.close}
          disabled={submission.pending}
          onClick={() => dialog.current?.close()}
          aria-label="Close enquiry"
        >
          ×
        </button>
        <h2 id="enquiry-title">Request a quote.</h2>
        <p>
          {hasItems ? "Your estimate" : "Your enquiry"}
          {guideText ? ", homepage guide answers" : ""} and any requirements
          will be sent directly to Halenn.
        </p>
        {hasItems && (
          <div className={s.enquirySummary}>
            <strong>
              {investmentLabel(result)}
              {result.oneTime > 0 ? " one-time" : ""}
            </strong>
            <span>{monthlyLabel}</span>
            {result.quoteRequired && (
              <span>Custom work will be quoted separately.</span>
            )}
          </div>
        )}
        <form
          ref={enquiryForm}
          aria-busy={submission.pending}
          onInput={submission.firstInput}
          onInvalidCapture={submission.invalid}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const message = [
              String(
                data.get("message") ||
                  "I’d like a quote for this starting point.",
              ),
              guideText,
              hasItems ? buildBrief(selection, customNotes) : "",
            ]
              .filter(Boolean)
              .join("\n\n");
            void submission.submit({
              name: String(data.get("name") || ""),
              email: String(data.get("email") || ""),
              company: String(data.get("company") || ""),
              message,
              website: String(data.get("website") || ""),
            });
          }}
        >
          <label>
            Your name
            <input
              name="name"
              autoComplete="name"
              required
              maxLength={100}
              disabled={submission.pending || submission.sent}
            />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              disabled={submission.pending || submission.sent}
            />
          </label>
          <label>
            Business name (optional)
            <input
              name="company"
              autoComplete="organization"
              maxLength={180}
              disabled={submission.pending || submission.sent}
            />
          </label>
          <label>
            {hasItems || guideText
              ? "Anything else you’d like us to know? (optional)"
              : "What do you have in mind?"}
            <textarea
              name="message"
              rows={3}
              required={!hasItems && !guideText}
              maxLength={1800}
              disabled={submission.pending || submission.sent}
            />
          </label>
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "-10000px",
              width: 1,
              height: 1,
              overflow: "hidden",
            }}
          >
            <label>
              Leave this field empty
              <input name="website" autoComplete="off" tabIndex={-1} />
            </label>
          </div>
          <button
            className={s.primary}
            type="submit"
            disabled={submission.pending || submission.sent}
          >
            {submission.pending
              ? "Sending…"
              : submission.sent
                ? "Enquiry received"
                : "Send enquiry"}{" "}
            <Arrow />
          </button>
          <p className={s.help}>
            We use your details to respond to your enquiry.{" "}
            <a href="/privacy">Privacy policy</a>.
          </p>
          {submission.error && <p role="alert">{submission.error}</p>}
          {submission.conflict && (
            <button
              type="button"
              onClick={() => {
                submission.restart();
                enquiryForm.current?.reset();
              }}
            >
              Start a new enquiry
            </button>
          )}
          {submission.sent && <p role="status">{enquiryReceivedMessage}</p>}
          <p className={s.help}>
            Prefer email?{" "}
            <a href="mailto:contact@halenn.com">contact@halenn.com</a>.
          </p>
        </form>
      </dialog>
    </EstimateProvider>
  );
}
