"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ActionArrow } from "./Action";
import SilkEcho from "./SilkEcho";
import controls from "./controls.module.css";
import s from "./experience.module.css";

const EnquiryContext = createContext<{
  enquiryGoal: string;
  setEnquiryGoal: React.Dispatch<React.SetStateAction<string>>;
}>({ enquiryGoal: "", setEnquiryGoal: () => {} });
export const useEnquiry = () => useContext(EnquiryContext);
export function ExperienceProvider({ children }: { children: ReactNode }) {
  const [enquiryGoal, setEnquiryGoal] = useState("");
  return (
    <EnquiryContext.Provider value={{ enquiryGoal, setEnquiryGoal }}>
      {children}
    </EnquiryContext.Provider>
  );
}
export function Contact({ email }: { email?: string }) {
  const { enquiryGoal, setEnquiryGoal } = useEnquiry();
  const form = useRef<HTMLDialogElement>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (enquiryGoal) form.current?.showModal();
  }, [enquiryGoal]);
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
        onClose={() => { setEnquiryGoal(""); setSaved(false); }}
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
              const body = `Name: ${values.get("name")}\nEmail: ${values.get("email")}\n\n${values.get("project")}`;
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
            <textarea key={enquiryGoal} name="project" required rows={4} defaultValue={enquiryGoal} />
          </label>
          <p>
            Tell us about the task or idea. You don’t need to choose a solution yet.
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
