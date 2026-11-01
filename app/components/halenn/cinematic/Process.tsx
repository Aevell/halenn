"use client";

import { ActionArrow } from "./Action";
import { useEnquiry } from "./Experience";
import controls from "./controls.module.css";
import s from "./process.module.css";

const steps = [
  {
    title: "Tell us what you need.",
    text: "Tell us about your business, what you want to improve and the tools you already use. You don’t need a technical brief. We’ll help you find the right approach.",
    label: "You share",
    detail: "Your goal, ideas and any existing website or tools.",
  },
  {
    title: "Agree a clear plan.",
    text: "We put together a proposal with the scope, price and expected timeline. Any ongoing platform costs are explained before you decide to go ahead.",
    label: "You approve",
    detail: "What we’ll build, what it costs and when to expect it.",
  },
  {
    title: "See it take shape.",
    text: "We build your website, webshop, app or automation and share a version for you to review. You give feedback, and we make the refinements agreed in your scope.",
    label: "We work together",
    detail: "You provide content and feedback. We handle the build.",
  },
  {
    title: "Launch with confidence.",
    text: "We test the important journeys, prepare for launch and show you how to use your solution. Ongoing care, support or new features can be arranged separately.",
    label: "You receive",
    detail: "A tested solution, a clear handover and your next steps.",
  },
];

export default function Process() {
  const { setEnquiryGoal } = useEnquiry();

  return (
    <section id="process" className={s.process} aria-labelledby="process-title">
      <div className={s.intro}>
        <div>
          <p className={s.eyebrow}>How we work</p>
          <h2 id="process-title">
            Your idea. A clear plan.
            <br />
            <em>Built together.</em>
          </h2>
        </div>
        <p className={s.introduction}>
          From the first conversation to a working solution, here’s what working
          with Halenn looks like. You bring your business knowledge. We bring it to
          life online.
        </p>
      </div>

      <ol className={s.steps} role="list">
        {steps.map((step, index) => (
          <li className={s.step} key={step.title} id={`process-step-${index}`}>
            <span className={s.number} aria-hidden="true">0{index + 1}</span>
            <h3>{step.title}</h3>
            <p className={s.description}>{step.text}</p>
            <div className={s.expectation}>
              <p className={s.label}>{step.label}</p>
              <p>{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className={s.nextStep}>
        <p>Start with a conversation. We’ll work out the details together.</p>
        <button
          className={`${controls.action} ${s.action}`}
          onClick={() => setEnquiryGoal("I’d like to discuss a project.\n\nWhat I want to improve in my business is: ")}
        >
          <span>Tell us about your idea</span>
          <ActionArrow />
        </button>
      </div>
    </section>
  );
}
