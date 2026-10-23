"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Arrow } from "./Shared";
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
function Concept({ index }: { index: number }) {
  const p = projects[index];
  return (
    <div className={`${s.concept} ${p.theme}`}>
      <div className={s.conceptNav}>
        <b>{p.name}</b>
        <span>
          {index === 1 ? "Collection / About" : "Independent by design"} ↗
        </span>
      </div>
      <div className={s.conceptTitle}>{p.title}</div>
      {index === 0 ? (
        <div className={s.building}>
          <i />
          <i />
          <i />
        </div>
      ) : index === 1 ? (
        <div className={s.objects}>
          <i />
          <i />
          <i />
        </div>
      ) : (
        <div className={s.nodes}>
          <span>New enquiry</span>
          <i>→</i>
          <span>n8n</span>
          <i>→</i>
          <span>Your CRM</span>
        </div>
      )}
      <div className={s.conceptBottom}>
        {index === 0
          ? "Spaces shaped around life."
          : index === 1
            ? "Considered forms. Everyday rituals."
            : "Enquiry → Qualification → Follow-up"}
        <span>Concept / 2026</span>
      </div>
    </div>
  );
}
export function Projects() {
  const section = useRef<HTMLElement>(null),
    track = useRef<HTMLDivElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const [active, setActive] = useState(0),
    [opened, setOpened] = useState(0);
  const current = useRef(0),
    enhanced = useRef(false),
    bounds = useRef({ top: 0, range: 1 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const root = section.current!,
      rail = track.current!;
    const media = matchMedia(
      "(min-width: 1001px) and (min-height: 681px) and (prefers-reduced-motion: no-preference)",
    );
    let raf = 0;
    function paint() {
      raf = 0;
      if (!enhanced.current) return;
      const p = Math.max(
        0,
        Math.min(1, (scrollY - bounds.current.top) / bounds.current.range),
      );
      const v = p * 2;
      rail.style.transform = `translate3d(${-v * 68}vw,0,0)`;
      Array.from(rail.children).forEach((node, i) => {
        (node as HTMLElement).style.transform =
          `perspective(1600px) rotateY(${(i - v) * -15}deg) translateY(${Math.abs(i - v) * 35}px)`;
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
      enhanced.current = media.matches;
      root.toggleAttribute("data-ribbon", media.matches);
      rail.style.transform = "";
      if (!media.matches) {
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
        range: Math.max(1, root.offsetHeight - innerHeight),
      };
      schedule();
    }
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", measure);
    media.addEventListener("change", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", measure);
      media.removeEventListener("change", measure);
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
      <div className={s.projectStage}>
        <div className={s.sectionTop}>
          <span>02 / Concept explorations</span>
          <span>Scroll, drag or explore with arrows</span>
        </div>
        <h2 id="projects-title">
          What we
          <br />
          <em>could build.</em>
        </h2>
        <div
          className={s.viewport}
          onPointerDown={(e) => {
            if (enhanced.current) {
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
                  if (!enhanced.current || e.detail === 0) {
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
                <span className={s.projectLabel}>
                  {p.type}
                  <span>Explore concept ↗</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className={s.projectControls}>
          <p aria-live="polite">
            <b>{projects[active].name}</b>
            <span>Concept project · illustrative content</span>
          </p>
          <div>
            <button
              aria-label="Previous project"
              disabled={active === 0}
              onClick={() => go(active - 1)}
            >
              ←
            </button>
            <span>0{active + 1} / 03</span>
            <button
              aria-label="Next project"
              disabled={active === 2}
              onClick={() => go(active + 1)}
            >
              →
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
export function Process() {
  return (
    <section id="process" className={s.process} aria-labelledby="process-title">
      <div className={s.sectionTop}>
        <span>03 / From idea to everyday</span>
        <span>A considered way forward</span>
      </div>
      <h2 id="process-title">
        Good work.
        <br />
        <em>Clear process.</em>
      </h2>
      {[
        {
          title: "Shape it.",
          text: "We start with your business, your audience and what the website needs to do.",
          list: "Discovery / Direction / Scope",
        },
        {
          title: "Build it.",
          text: "Design and development move together. You see the work take shape, from the first screen to the connected systems.",
          list: "Design / Development / Integrations",
        },
        {
          title: "Keep it moving.",
          text: "Launch with a clear handover. Add ongoing maintenance and improvements as your business evolves.",
          list: "Launch / Care / Iteration",
        },
      ].map((step, i) => (
        <article className={s.chapter} key={step.title}>
          <span className={s.chapterNumber} aria-hidden="true">
            0{i + 1}
          </span>
          <div>
            <span className={s.kicker}>
              0{i + 1} / {step.list}
            </span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </div>
        </article>
      ))}
    </section>
  );
}
export function Contact() {
  const { selected } = useProjectScope();
  const form = useRef<HTMLDialogElement>(null);
  const [saved, setSaved] = useState(false);
  return (
    <section id="contact" className={s.contact} aria-labelledby="contact-title">
      <div className={s.sectionTop}>
        <span>04 / Your next chapter</span>
        <span>A company by Aevell</span>
      </div>
      <p>Have something in mind?</p>
      <h2 id="contact-title">
        LET’S
        <br />
        <em>TALK.</em>
      </h2>
      <div className={s.contactBottom}>
        <button
          onClick={() => {
            setSaved(false);
            form.current?.showModal();
          }}
        >
          Start a project <Arrow />
        </button>
        <span>
          Websites. Commerce. Connected systems.
          <br />
          <small>Example contact: hello@halenn.example</small>
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
        <p className={s.kicker}>Local prototype / Nothing is sent</p>
        <h2 id="contact-dialog-title">Tell us about it.</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
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
          <button type="submit">
            Preview enquiry <Arrow />
          </button>
          {saved && (
            <p role="status">
              Your example enquiry is ready. This demo has not sent or stored
              your details.
            </p>
          )}
        </form>
      </dialog>
    </section>
  );
}
