import s from "./faq.module.css";

const questions = [
  {
    question: "Can you improve my existing website or tools?",
    answer: "Yes. We can improve an existing website or connect the tools you already use. We first check how they’re built and what they support, then recommend what’s worth keeping or changing.",
  },
  {
    question: "How long does a project usually take?",
    answer: "Timing depends on the scope, the content you have ready and any systems we need to connect. We agree an expected timeline in your proposal before work starts.",
  },
  {
    question: "Will I be able to update things myself?",
    answer: "Our website packages include editable content, and we show you how to manage it at handover. For apps and automations, we agree which settings you can manage and where you may need support.",
  },
  {
    question: "What ongoing costs should I expect?",
    answer: "Depending on your solution, you may need hosting, a domain, platform subscriptions or usage-based services such as AI, calls or messages. We identify these costs in your proposal. Website and app care are optional; automation support is quoted separately.",
    href: "/pricing#questions",
    link: "More about pricing and ongoing costs",
  },
  {
    question: "What happens after I send an enquiry?",
    answer: "We review your idea, clarify any questions and put together a proposal with the scope, price and expected timeline. You can review it before deciding whether to go ahead.",
  },
];

export default function Faq() {
  return (
    <section id="faq" className={s.faq} aria-labelledby="faq-title">
      <div className={s.intro}>
        <p className={s.eyebrow}>Good to know</p>
        <h2 id="faq-title">Frequently asked<br /><em>questions.</em></h2>
      </div>
      <div className={s.questions}>
        {questions.map(item => (
          <details key={item.question} name="home-faq" className={s.item}>
            <summary>
              <span>{item.question}</span>
              <span className={s.icon} aria-hidden="true" />
            </summary>
            <div className={s.answer}>
              <p>{item.answer}</p>
              {item.href && <a href={item.href}>{item.link}</a>}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
