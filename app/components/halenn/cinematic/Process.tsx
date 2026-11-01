"use client";

import { ActionArrow } from "./Action";
import { useEnquiry } from "./Experience";
import controls from "./controls.module.css";
import s from "./process.module.css";

const steps = [
  {
    title: "Tell us what you need.",
    text: "Share what you want to improve and the tools you already use. We’ll help you find the right approach. No technical brief needed.",
  },
  {
    title: "Agree a clear plan.",
    text: "Before you decide, we set out what we’ll build, the price, expected timing and any ongoing platform costs.",
  },
  {
    title: "See it take shape.",
    text: "We build a first version, then refine it with your feedback within the agreed scope. You provide any content it needs.",
  },
  {
    title: "Launch with confidence.",
    text: "We test the important journeys, launch and show you how to use your solution. Ongoing care and support can be arranged separately.",
  },
];

export default function Process() {
  const { setEnquiryGoal } = useEnquiry();

  return (
    <section id="process" className={s.process} aria-labelledby="process-title">
      <div className={s.atmosphere} data-flow-ambient aria-hidden="true" />
      <div className={s.intro} data-flow-intro>
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
          <li className={s.step} key={step.title} id={`process-step-${index}`} data-process-step={index}>
            <span className={s.number} aria-hidden="true">0{index + 1}</span>
            <h3>{step.title}</h3>
            <p className={s.description}>{step.text}</p>
          </li>
        ))}
      </ol>

      <div className={s.nextStep}>
        <p>Start with a conversation. We’ll work out the details together.</p>
        <button
          className={`${controls.action} ${controls.quiet} ${s.action}`}
          onClick={() => setEnquiryGoal("I’d like to discuss a project.\n\nWhat I want to improve in my business is: ")}
        >
          <span>Tell us about your idea</span>
          <ActionArrow />
        </button>
      </div>
    </section>
  );
}
