"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Concept from "../Concept";
import { Arrow } from "../Brand";
import { ActionArrow } from "./Action";
import SilkEcho from "./SilkEcho";
import controls from "./controls.module.css";
import s from "./experience.module.css";

const ScopeContext = createContext<{
  selected: string[];
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
}>({ selected: [], setSelected: () => {} });
export const useProjectScope = () => useContext(ScopeContext);
export function ExperienceProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <ScopeContext.Provider value={{ selected, setSelected }}>
      {children}
    </ScopeContext.Provider>
  );
}
// Reading holds on phone: each complete composition has room to settle.
const phoneStep = (p: number) =>
  Math.max(0, Math.min(1, (p - 0.1) / 0.28)) +
  Math.max(0, Math.min(1, (p - 0.58) / 0.28));

const projects = [
  {
    name: "FORMA",
    type: "Architecture / Website concept",
    title: "Space to think.",
    description:
      "An editorial website for an imagined architecture studio. Large project imagery, considered typography and a simple enquiry journey.",
    scope: [
      "Art direction & responsive website",
      "Project collection & CMS",
      "Enquiry forms",
    ],
    theme: s.architecture,
  },
  {
    name: "OBJECT",
    type: "Design store / Commerce concept",
    title: "Objects for living.",
    description:
      "A fictional design store exploring product discovery, a considered cart and a clear checkout journey.",
    scope: [
      "Product catalogue & collections",
      "Cart & checkout integration",
      "Order notifications",
    ],
    theme: s.commerce,
  },
  {
    name: "CONNECTED",
    type: "Operations / n8n concept",
    title: "Less busywork.\nMore possibility.",
    description:
      "An illustrative workflow connecting an incoming enquiry to a CRM, a team notification and a follow-up task.",
    scope: [
      "Form-to-CRM integration",
      "n8n workflow design",
      "Error handling & handover",
    ],
    theme: s.workflow,
  },
];
export function Projects() {
  const section = useRef<HTMLElement>(null),
    track = useRef<HTMLDivElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const [active, setActive] = useState(0),
    [opened, setOpened] = useState(0);
  const current = useRef(0),
    enhanced = useRef(false),
    pocket = useRef(false),
    step = useRef(1),
    bounds = useRef({ top: 0, range: 1 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const root = section.current!,
      rail = track.current!;
    const media = matchMedia(
      "(min-width: 1001px) and (min-height: 681px) and (prefers-reduced-motion: no-preference)",
    );
    const phone = matchMedia(
      "(max-width: 600px) and (min-height: 700px) and (prefers-reduced-motion: no-preference)",
    );
    const stage = root.querySelector<HTMLElement>("[data-project-stage]")!;
    let raf = 0;
    function paint() {
      raf = 0;
      if (!enhanced.current) return;
      const p = Math.max(
        0,
        Math.min(1, (scrollY - bounds.current.top) / bounds.current.range),
      );
      const v = pocket.current ? phoneStep(p) : p * 2;
      rail.style.transform = `translate3d(${-v * step.current}px,0,0)`;
      Array.from(rail.children).forEach((node, i) => {
        (node as HTMLElement).style.transform = pocket.current
          ? `translate3d(0, ${Math.min(1, Math.abs(i - v)) * 16}px, 0)`
          : `perspective(1600px) rotateY(${Math.max(-5, Math.min(5, (i - v) * -5))}deg) translateY(${Math.min(1, Math.abs(i - v)) * 24}px)`;
      });
      const next = Math.round(v);
      if (next !== current.current) {
        current.current = next;
        setActive(next);
      }
    }
    function schedule() {
      if (!raf) raf = requestAnimationFrame(paint);
    }
    function measure() {
      pocket.current = phone.matches;
      enhanced.current = media.matches || pocket.current;
      root.toggleAttribute("data-ribbon", enhanced.current);
      root.toggleAttribute("data-pocket-ribbon", pocket.current);
      // If text zoom/content cannot fit, preserve the native, flowing carousel.
      if (
        pocket.current &&
        (stage.scrollHeight > stage.clientHeight + 1 ||
          Array.from(rail.querySelectorAll<HTMLElement>("[data-concept]")).some(
            (card) => card.scrollHeight > card.clientHeight + 1,
          ))
      ) {
        pocket.current = false;
        enhanced.current = false;
        root.removeAttribute("data-ribbon");
        root.removeAttribute("data-pocket-ribbon");
      }
      step.current =
        (rail.children[0] as HTMLElement).offsetWidth +
        parseFloat(getComputedStyle(rail).columnGap || "0");
      rail.style.transform = "";
      if (!enhanced.current) {
        const n = Math.max(
          0,
          Math.min(
            2,
            Math.round(
              rail.scrollLeft /
                ((rail.children[0] as HTMLElement).offsetWidth + 24),
            ),
          ),
        );
        current.current = n;
        setActive(n);
      }
      Array.from(rail.children).forEach(
        (n) => ((n as HTMLElement).style.transform = ""),
      );
      bounds.current = {
        top: root.getBoundingClientRect().top + scrollY,
        range: Math.max(1, root.offsetHeight - stage.offsetHeight),
      };
      schedule();
    }
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", measure);
    media.addEventListener("change", measure);
    phone.addEventListener("change", measure);
    const resize = new ResizeObserver(measure);
    if (root.parentElement) resize.observe(root.parentElement);
    return () => {
      resize.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", measure);
      media.removeEventListener("change", measure);
      phone.removeEventListener("change", measure);
    };
  }, []);
  const go = (index: number) => {
    const next = Math.max(0, Math.min(2, index));
    setActive(next);
    current.current = next;
    if (enhanced.current)
      window.scrollTo({
        top: bounds.current.top + (bounds.current.range * next) / 2,
        behavior: "instant",
      });
    else
      track.current?.children[next]?.scrollIntoView({
        behavior: "instant",
        block: "nearest",
        inline: "center",
      });
  };
  return (
    <section
      ref={section}
      id="projects"
      className={s.projects}
      aria-labelledby="projects-title"
      data-local-keys
    >
      <div className={s.projectStage} data-project-stage>
        <SilkEcho scene="projects" />
        <div className={s.sectionTop}>
          <span>Concept projects</span>
          <span>Imagined businesses. Real possibilities.</span>
        </div>
        <h2 id="projects-title">
          What we <br />
          <em>could build.</em>
        </h2>
        <div
          className={s.viewport}
          data-project-viewport
          onPointerDown={(e) => {
            if (
              enhanced.current &&
              !pocket.current &&
              e.pointerType === "mouse"
            ) {
              drag.current = { x: e.clientX, y: scrollY };
              e.currentTarget.setPointerCapture(e.pointerId);
            }
          }}
          onPointerMove={(e) => {
            if (drag.current)
              window.scrollTo({
                top: drag.current.y + (drag.current.x - e.clientX) * 2,
                behavior: "instant",
              });
          }}
          onPointerUp={(e) => {
            if (drag.current && Math.abs(drag.current.x - e.clientX) < 5) {
              const target = document
                .elementFromPoint(e.clientX, e.clientY)
                ?.closest<HTMLButtonElement>("[data-project]");
              if (target) {
                setOpened(Number(target.dataset.project));
                dialog.current?.showModal();
              }
            }
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <div
            ref={track}
            className={s.track}
            onScroll={(e) => {
              if (!enhanced.current) {
                const el = e.currentTarget;
                const n = Math.round(
                  el.scrollLeft / (el.children[0]?.clientWidth + 24),
                );
                setActive(Math.max(0, Math.min(2, n)));
                current.current = n;
              }
            }}
          >
            {projects.map((p, i) => (
              <button
                data-project={i}
                key={p.name}
                className={s.project}
                onClick={(e) => {
                  if (!enhanced.current || pocket.current || e.detail === 0) {
                    setOpened(i);
                    dialog.current?.showModal();
                  }
                }}
                onFocus={(e) => {
                  if (
                    enhanced.current &&
                    e.currentTarget.matches(":focus-visible")
                  )
                    go(i);
                }}
                aria-label={`Open ${p.name} concept project`}
              >
                <Concept index={i} />
              </button>
            ))}
          </div>
        </div>
        <div className={s.projectControls}>
          <p aria-live="polite">
            <b>{projects[active].name}</b>
            <span>{projects[active].type.replace(" / ", " · ")}</span>
          </p>
          <div>
            <button
              aria-label="Previous project"
              disabled={active === 0}
              onClick={() => go(active - 1)}
            >
              <span style={{ display: "flex", transform: "rotate(180deg)" }}><Arrow /></span>
            </button>
            <span>0{active + 1} / 03</span>
            <button
              aria-label="Next project"
              disabled={active === 2}
              onClick={() => go(active + 1)}
            >
              <Arrow />
            </button>
          </div>
        </div>
      </div>
      <dialog
        ref={dialog}
        className={s.dialog}
        aria-labelledby="project-dialog-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <button
          className={s.close}
          onClick={() => dialog.current?.close()}
          aria-label="Close project preview"
        >
          Close ×
        </button>
        <p className={s.kicker}>Concept project / Example content</p>
        <h2 id="project-dialog-title">{projects[opened].name}</h2>
        <Concept index={opened} />
        <p>{projects[opened].description}</p>
        <ul>
          {projects[opened].scope.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className={s.kicker}>
          Illustrative scope. No client relationship or results implied.
        </p>
      </dialog>
    </section>
  );
}
const processSteps = [
  { title: "Shape it.", label: "Shape", text: "Start with your business, your audience and what the website needs to do.", detail: "Discovery. Direction. A clear scope." },
  { title: "Build it.", label: "Build", text: "Design and development move together. Watch the first screen become a complete, connected experience.", detail: "Design. Development. Connected tools." },
  { title: "Make it live.", label: "Launch", text: "Check the details, test the journeys and make the handover clear. A considered launch, from start to finish.", detail: "Testing. Handover. Launch." },
  { title: "Keep improving.", label: "Improve", text: "Add ongoing maintenance, useful automations and thoughtful improvements as your business evolves.", detail: "Website care. n8n workflows. What’s next." },
];
export function Process() {
  const root = useRef<HTMLElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const navigation = useRef({ active: false, top: 0, range: 1 });
  useEffect(() => {
    const section = root.current!, track = rail.current!;
    const media = matchMedia("(min-width:1001px) and (min-height:681px) and (prefers-reduced-motion:no-preference)");
    const phone = matchMedia("(max-width:600px) and (min-height:740px) and (prefers-reduced-motion:no-preference)");
    const stage = section.querySelector<HTMLElement>("[data-process-stage]")!;
    let frame = 0, step = 0;
    function paint() {
      frame = 0;
      const { active, top, range } = navigation.current;
      if (!active) return;
      const p = Math.max(0, Math.min(1, (scrollY - top) / range));
      // Each chapter holds still before the next advances; reverse scroll stays immediate.
      const position = [0, 1, 2].reduce((value, i) => value + Math.max(0, Math.min(1, (p * 3 - i - .18) / .64)), 0);
      track.style.transform = `translate3d(${-position * 25}%,0,0)`;
      if (line.current) line.current.style.transform = `scaleX(${position / 3})`;
      const next = Math.round(position);
      if (next !== step) { step = next; setCurrentStep(next); }
    }
    function schedule() { if (!frame && navigation.current.active) frame = requestAnimationFrame(paint); }
    function measure() {
      let active = media.matches || phone.matches;
      section.toggleAttribute("data-process-motion", active);
      section.toggleAttribute("data-pocket-process", phone.matches);
      if (active && stage.scrollHeight > stage.clientHeight + 2) {
        active = false;
        section.removeAttribute("data-process-motion");
        section.removeAttribute("data-pocket-process");
      }
      track.style.removeProperty("transform");
      line.current?.style.removeProperty("transform");
      navigation.current = { active, top: section.getBoundingClientRect().top + scrollY, range: Math.max(1, section.offsetHeight - stage.offsetHeight) };
      schedule();
    }
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", measure);
    media.addEventListener("change", measure);
    phone.addEventListener("change", measure);
    const resize = new ResizeObserver(measure);
    if (section.parentElement) resize.observe(section.parentElement);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", measure);
      media.removeEventListener("change", measure);
      phone.removeEventListener("change", measure);
    };
  }, []);
  return <section ref={root} id="process" className={s.process} aria-labelledby="process-title" data-local-keys>
    <div className={s.processStage} data-process-stage>
      <h2 id="process-title">From first thought.<br /><em>To what’s next.</em></h2>
      <nav className={s.processNav} aria-label="Project process">
        <div className={s.processLine} aria-hidden="true"><span ref={line} /></div>
        {processSteps.map((step, i) => <a href={`#process-step-${i}`} key={step.label} aria-current={currentStep === i ? "step" : undefined} onClick={(event) => {
          if (!navigation.current.active) return;
          event.preventDefault();
          const { top, range } = navigation.current;
          window.scrollTo({ top: top + range * i / 3, behavior: "instant" });
          setCurrentStep(i);
        }}><span>0{i + 1}</span>{step.label}</a>)}
      </nav>
      <div className={s.processViewport}><div ref={rail} className={s.processRail}>
        {processSteps.map((step, i) => <article id={`process-step-${i}`} className={s.chapter} key={step.title}>
          <span className={s.chapterNumber} aria-hidden="true">0{i + 1}</span>
          <div><h3>{step.title}</h3><p>{step.text}</p><span className={s.chapterDetail}>{step.detail}</span></div>
        </article>)}
      </div></div>
    </div>
  </section>;
}
export function Contact({ email }: { email?: string }) {
  const { selected } = useProjectScope();
  const form = useRef<HTMLDialogElement>(null);
  const [saved, setSaved] = useState(false);
  return (
    <section id="contact" className={s.contact} aria-labelledby="contact-title">
      <div className={s.contactLight} data-contact-light aria-hidden="true" />
      <SilkEcho scene="contact" />
      <div className={s.sectionTop}>
        <span>Let’s make something worthwhile.</span>
      </div>
      <p>Have something in mind?</p>
      <h2 id="contact-title">
        <span data-contact-word>LET’S</span> <em data-contact-word>TALK.</em>
      </h2>
      <div className={s.contactBottom}>
        <button className={controls.action}
          onClick={() => {
            setSaved(false);
            form.current?.showModal();
          }}
        >
          Start a project <ActionArrow />
        </button>
        <span>
          Websites. Commerce. Connected systems.
          <br />
          {email ? <a href={`mailto:${email}`}>{email}</a> : <small>Example contact: hello@halenn.example</small>}
        </span>
      </div>
      <dialog
        ref={form}
        className={s.dialog}
        aria-labelledby="contact-dialog-title"
      >
        <button
          className={s.close}
          aria-label="Close enquiry"
          onClick={() => form.current?.close()}
        >
          Close ×
        </button>
        <p className={s.kicker}>{email ? "Opens your email app. Send your enquiry from there." : "Local prototype / Nothing is sent"}</p>
        <h2 id="contact-dialog-title">Tell us about it.</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email) {
              const values = new FormData(e.currentTarget);
              const body = `Name: ${values.get("name")}\nEmail: ${values.get("email")}\n\n${values.get("project")}\n\nSelected scope: website${selected.length ? ` + ${selected.join(", ")}` : ""}.`;
              window.location.href = `mailto:${email}?subject=${encodeURIComponent("A new project for Halenn")}&body=${encodeURIComponent(body)}`;
            }
            setSaved(true);
          }}
        >
          <label>
            Your name
            <input name="name" required autoComplete="name" />
          </label>
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            What are you planning?
            <textarea name="project" required rows={4} />
          </label>
          <p>
            Selected scope: website
            {selected.length ? ` + ${selected.join(", ")}` : ""}.
          </p>
          <button type="submit" className={controls.action}>
            {email ? "Open email draft" : "Preview enquiry"} <ActionArrow />
          </button>
          {saved && (
            <p role="status">
              {email ? `Complete your enquiry in your email app. If it did not open, email ${email} directly.` : "Your example enquiry is ready. This demo has not sent or stored your details."}
            </p>
          )}
        </form>
      </dialog>
    </section>
  );
}
