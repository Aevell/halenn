"use client";

import { useEffect, useRef, useState } from "react";
import { Arrow } from "../Brand";
import { useEnquiry } from "./Experience";
import {
  chooseGuideAnswer, guideBrief, guideComplete, guidePricingHref,
  guideQuestions, guideRecommendation, guideSummary, type GuideAnswers,
} from "../solution-guide";
import s from "./goals.module.css";

export default function Goals() {
  const { setEnquiryGoal } = useEnquiry();
  const [answers, setAnswers] = useState<GuideAnswers>({});
  const [step, setStep] = useState(0);
  const title = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const path = guideQuestions(answers);
  const finished = step >= path.length && guideComplete(answers);
  const question = path[Math.min(step, path.length - 1)];
  const recommendation = finished ? guideRecommendation(answers) : undefined;
  const pricingHref = finished ? guidePricingHref(answers) : undefined;
  const move = (next: number) => { moved.current = true; setStep(next); };

  useEffect(() => {
    if (!moved.current) return;
    const bounds = title.current?.getBoundingClientRect();
    if (bounds && (bounds.top < 112 || bounds.bottom > innerHeight * .65))
      panel.current?.scrollIntoView({ block: "start", behavior: "instant" });
    title.current?.focus({ preventScroll: true });
  }, [step]);

  const startAgain = () => {
    setAnswers({}); move(0);
    requestAnimationFrame(() => title.current?.focus({ preventScroll: true }));
  };
  const discuss = () => {
    const shared = guideSummary(answers).filter(row => row.answer !== "Not answered");
    const context = finished ? guideBrief(answers) : shared.length
      ? ["What I’ve shared so far:", ...shared.map(row => `${row.question}\n${row.answer}`)].join("\n")
      : "What I want to improve in my business is: ";
    setEnquiryGoal(`I’d like to discuss a project.\n\n${context}`);
  };

  return <section id="goals" className={s.goals} aria-labelledby="goals-title">
    <div className={s.intro}>
      <p className={s.eyebrow}>Find your starting point</p>
      <h2 id="goals-title">What would you<br /><em>like to improve?</em></h2>
      <p>Answer 3–5 short questions to explore what could help your business. No email needed to see your result.</p>
    </div>
    <noscript><p className={s.noScript}>The guide needs JavaScript. Use the service and pricing links below, or contact us to discuss your idea.</p><style>{`[data-solution-guide-interactive] { display: none !important; }`}</style></noscript>
    <div ref={panel} className={s.panel} data-solution-guide-interactive>
      <div className={s.progress}>
        <p>{finished ? "Your suggested starting point" : `Question ${step + 1}${answers.goal && (answers.goal !== "time" || answers.behaviour) ? ` of ${path.length}` : ""}`}</p>
        {(step > 0 || answers.goal) && <button type="button" className={s.textButton} onClick={startAgain}>Start again</button>}
      </div>
      {recommendation ? <div className={s.result}>
        <h3 ref={title} tabIndex={-1}>{recommendation.title}</h3>
        <p className={s.resultDescription}>{recommendation.description}</p>
        <p className={s.listLabel}>A possible first scope</p>
        <ul>{recommendation.includes.map(item => <li key={item}>{item}</li>)}</ul>
        <p className={s.note}>{recommendation.note}</p>
        <div className={s.resultActions}>
          <button className={s.primary} onClick={discuss}>Discuss this with us<Arrow /></button>
          {pricingHref && <a className={s.secondary} href={pricingHref}>See my starting price<Arrow /></a>}
        </div>
        <details className={s.answers}>
          <summary>Your answers</summary>
          <dl>{guideSummary(answers).map(row => <div key={row.question}><dt>{row.question}</dt><dd>{row.answer}</dd></div>)}</dl>
        </details>
        <button className={s.textButton} onClick={() => move(path.length - 1)}>Back to my answers</button>
      </div> : <form className={s.question} onSubmit={event => {
        event.preventDefault();
        if (answers[question.id]) move(step + 1);
      }}>
        <h3 ref={title} id="guide-question-title" tabIndex={-1}>{question.title}</h3>
        <p id="guide-question-hint" className={s.hint}>{question.hint}</p>
        <fieldset aria-labelledby="guide-question-title" aria-describedby="guide-question-hint">
          <div className={s.options}>
            {question.options.map((choice, index) => <label key={`${question.id}-${choice.value}`} className={s.option} data-selected={answers[question.id] === choice.value || undefined}>
              <input type="radio" name={`guide-${question.id}`} value={choice.value} checked={answers[question.id] === choice.value}
                onChange={() => setAnswers(previous => chooseGuideAnswer(previous, question.id, choice.value))} />
              <span className={s.optionNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <span className={s.optionText}><strong>{choice.label}</strong>{choice.detail && <span>{choice.detail}</span>}</span>
              <span className={s.indicator} aria-hidden="true">{answers[question.id] === choice.value ? "✓" : ""}</span>
            </label>)}
          </div>
        </fieldset>
        <div className={s.actions}>
          <div>{step > 0 && <button type="button" className={s.textButton} onClick={() => move(step - 1)}>Back</button>}</div>
          <button className={s.primary} type="submit" disabled={!answers[question.id]}>{answers.goal && step === path.length - 1 ? "See my starting point" : "Continue"}<Arrow /></button>
        </div>
      </form>}
    </div>
    <div className={s.browse}>
      <p>Already know what you need?</p>
      <nav aria-label="Browse services directly">
        <a href="/pricing?services=web&web=website#web-guide">Websites</a>
        <a href="/pricing?services=web&web=webshop#web-guide">Webshops</a>
        <a href="/pricing?services=automation#automation-guide">Automation & AI</a>
        <a href="/pricing?services=app#apps-title">Apps</a>
      </nav>
    </div>
    <div className={s.help}><p>Prefer to talk it through?</p><button className={s.textButton} onClick={discuss}>Tell us about your idea<Arrow /></button></div>
  </section>;
}
