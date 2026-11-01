"use client";

import { Arrow } from "../Brand";
import { useProjectScope } from "./Experience";
import s from "./goals.module.css";

const goals = [
  { title: "Get more enquiries or bookings", text: "Help people find your business, book an appointment and get a timely reply.", services: "Websites · Booking integration · Enquiry follow-up", action: "Explore websites", href: "/pricing?services=web&web=website#web-guide" },
  { title: "Sell products online", text: "Give customers a clear path from discovering your products to paying for an order.", services: "Webshops · Payments · Order connections", action: "Explore webshops", href: "/pricing?services=web&web=webshop#web-guide" },
  { title: "Reduce repetitive work", text: "Send reminders, follow up enquiries and connect the tools you already use.", services: "Reminders · Follow-ups · Integrations · AI assistants", action: "Explore automation", href: "/pricing?services=automation#automation-guide" },
  { title: "Build a tool for customers or staff", text: "Turn a specific task or business process into an app, portal or focused software solution.", services: "Apps · Portals · Scoped software", action: "Discuss an app idea", enquiry: "I’d like to discuss an app, portal or software tool for customers or staff.\n\nThe task I want to make easier is: " },
];

export default function Goals() {
  const { setEnquiryGoal } = useProjectScope();
  return <section id="goals" className={s.goals} aria-labelledby="goals-title">
    <div className={s.intro}>
      <p className={s.eyebrow}>Start with your business</p>
      <h2 id="goals-title">What would you<br /><em>like to improve?</em></h2>
      <p>Choose a goal. We’ll help you find the right website, app or automation to get there.</p>
    </div>
    <div className={s.grid}>
      {goals.map((goal, index) => <article className={s.card} key={goal.title}>
        <span className={s.number} aria-hidden="true">0{index + 1}</span>
        <h3>{goal.title}</h3>
        <p className={s.description}>{goal.text}</p>
        <p className={s.services}>{goal.services}</p>
        {goal.href
          ? <a className={s.action} href={goal.href}>{goal.action}<Arrow /></a>
          : <button className={s.action} onClick={() => setEnquiryGoal(goal.enquiry!)}>{goal.action}<Arrow /></button>}
      </article>)}
    </div>
    <div className={s.help}>
      <p>Not sure what you need?</p>
      <button className={s.action} onClick={() => setEnquiryGoal("I’m not sure which solution I need.\n\nWhat takes too much time in my business is: ")}>Tell us what takes too much time.<Arrow /></button>
    </div>
  </section>;
}
