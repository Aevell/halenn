"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Concept from "../Concept";
import { Arrow } from "../Brand";
import { ActionArrow, ActionLink } from "./Action";
import { useEnquiry } from "./Experience";
import controls from "./controls.module.css";
import dialogStyles from "./experience.module.css";
import s from "./services.module.css";

const services = [
  {
    id: "websites", label: "01 / Websites", name: "FORMA", example: "Website concept",
    title: <>First, make<br /><em>an impression.</em></>,
    text: "Help potential customers understand why they should choose your business and feel confident taking the next step.",
    features: ["Services and work, clearly presented", "Enquiry forms and booking connections", "Content you can update yourself"],
    href: "/pricing?services=web&web=website#web-guide", action: "Explore website pricing",
    description: "An imagined architecture studio with space for its projects, a clear introduction to its services and a simple enquiry journey.",
    scope: ["Responsive website and project collection", "Editable content", "Enquiry forms"],
  },
  {
    id: "commerce", label: "02 / Webshops", name: "OBJECT", example: "Webshop concept",
    title: <>Turn interest<br /><em>into an order.</em></>,
    text: "Give customers a straightforward way to buy, while your team spends less time managing each sale.",
    features: ["Products and collections", "Cart, checkout and payments", "Order notifications and connected tools"],
    href: "/pricing?services=web&web=webshop#web-guide", action: "Explore webshop pricing",
    description: "A fictional design store showing how product collections and a focused shopping experience can work together. Its project scope could include checkout, payments and order notifications.",
    scope: ["Product catalogue and collections", "Cart and payment-provider integration", "Order notifications"],
  },
  {
    id: "automation", label: "03 / Automation & AI", name: "CONNECTED", example: "Workflow concept",
    title: <>Make everyday<br /><em>work flow.</em></>,
    text: "Free up your team’s time and help customers get a quicker response, without adding more to your daily workload.",
    features: ["Follow-ups, reminders and integrations", "AI chat and phone assistants", "Custom agents and automation flows"],
    href: "/pricing?services=automation#automation-guide", action: "Explore automation pricing",
    description: "An illustrative enquiry workflow: capture a new enquiry, update the CRM and give the team a follow-up task. This example shows a defined workflow; AI assistants and agents are scoped around the job you need them to do.",
    scope: ["Enquiry-to-CRM connection", "Team notifications and follow-up tasks", "Error handling and handover"],
  },
];

export default function Services() {
  const { setEnquiryGoal } = useEnquiry();
  const dialog = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState<number | null>(null);
  const project = opened === null ? null : services[opened];

  useEffect(() => {
    if (opened !== null) dialog.current?.showModal();
  }, [opened]);

  return <section id="services" className={s.services} aria-labelledby="services-title">
    <span id="projects" className={s.anchor} aria-hidden="true" />
    <header className={s.intro} data-flow-intro>
      <div>
        <p className={s.eyebrow}>Services & examples</p>
        <h2 id="services-title">What we could<br /><em>build for you.</em></h2>
      </div>
      <p>Explore what each solution could do for your business. The previews below are concept projects for imagined businesses.</p>
    </header>
    <div className={s.rows}>
      {services.map((service, index) => <article key={service.id} id={service.id} className={s.service} aria-labelledby={`${service.id}-title`} data-service-chapter>
        <div className={s.atmosphere} aria-hidden="true">
          <div data-flow-ambient><Image src="/brand/halenn-silk-v1.png" alt="" fill sizes="130vw" draggable={false} /></div>
        </div>
        <div className={s.copy}>
          <p className={s.eyebrow}>{service.label}</p>
          <h3 id={`${service.id}-title`}>{service.title}</h3>
          <p className={s.description}>{service.text}</p>
          <ul className={s.features}>{service.features.map(feature => <li key={feature}>{feature}</li>)}</ul>
          <ActionLink href={service.href} quiet>{service.action}</ActionLink>
        </div>
        <figure className={s.example} data-flow-preview={index}>
          <button className={s.preview} onClick={() => setOpened(index)} aria-label={`Open ${service.name} ${service.example.toLowerCase()}`} aria-haspopup="dialog">
            <Concept index={index} motion />
            <span className={s.previewAction}>Explore example <Arrow /></span>
          </button>
          <figcaption><span>{service.name}</span><span>{service.example}</span></figcaption>
        </figure>
      </article>)}
    </div>
    <aside id="apps" className={s.apps} aria-labelledby="apps-intro-title">
      <div>
        <p className={s.eyebrow}>Apps & portals</p>
        <h3 id="apps-intro-title">A tool of your own?</h3>
        <p>Customer portals, staff tools and mobile apps, built around the people who use them. Tell us what they need to do, and we’ll help define the scope.</p>
      </div>
      <button className={`${controls.action} ${controls.quiet}`} onClick={() => setEnquiryGoal("I’d like to discuss an app or portal for my customers or team.\n\nWhat it needs to do:\n")}>Discuss an app idea <ActionArrow /></button>
    </aside>
    <dialog ref={dialog} className={`${dialogStyles.dialog} ${s.dialog}`} aria-labelledby="project-dialog-title" onClose={() => setOpened(null)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <button className={dialogStyles.close} onClick={() => dialog.current?.close()} aria-label="Close project preview">Close ×</button>
      {project && <>
        <p className={dialogStyles.kicker}>Concept project · Imagined business</p>
        <h2 id="project-dialog-title">{project.name}</h2>
        <Concept index={opened!} />
        <p>{project.description}</p>
        <ul>{project.scope.map(item => <li key={item}>{item}</li>)}</ul>
        <ActionLink href={project.href}>{project.action}</ActionLink>
      </>}
    </dialog>
  </section>;
}
