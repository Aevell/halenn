"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ActionArrow } from "./Action";
import SilkEcho from "./SilkEcho";
import controls from "./controls.module.css";
import s from "./experience.module.css";
import {
  enquiryReceivedMessage,
  useEnquirySubmission,
} from "../../../lib/enquiry-client";

const EnquiryContext = createContext<{
  enquiryGoal: string;
  enquiryOrigin: "homepage" | "quiz";
  setEnquiryGoal: (goal: string, origin?: "homepage" | "quiz") => void;
}>({ enquiryGoal: "", enquiryOrigin: "homepage", setEnquiryGoal: () => {} });
export const useEnquiry = () => useContext(EnquiryContext);
export function ExperienceProvider({ children }: { children: ReactNode }) {
  const [enquiry, setEnquiry] = useState<{
    goal: string;
    origin: "homepage" | "quiz";
  }>({ goal: "", origin: "homepage" });
  const setEnquiryGoal = useCallback(
    (goal: string, origin: "homepage" | "quiz" = "homepage") =>
      setEnquiry({ goal, origin }),
    [],
  );
  return (
    <EnquiryContext.Provider
      value={{
        enquiryGoal: enquiry.goal,
        enquiryOrigin: enquiry.origin,
        setEnquiryGoal,
      }}
    >
      {children}
    </EnquiryContext.Provider>
  );
}
export function Contact({ email }: { email?: string }) {
  const { enquiryGoal, enquiryOrigin, setEnquiryGoal } = useEnquiry();
  const form = useRef<HTMLDialogElement>(null);
  const [previewSaved, setPreviewSaved] = useState(false);
  const entry = useRef<HTMLFormElement>(null);
  const submission = useEnquirySubmission(!!email);
  const { open } = submission;
  useEffect(() => {
    if (enquiryGoal && form.current && !form.current.open) {
      open(enquiryOrigin, true);
      form.current.showModal();
    }
  }, [enquiryGoal, enquiryOrigin, open]);
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
        <button
          className={controls.action}
          onClick={() => {
            setPreviewSaved(false);
            if (submission.open("homepage")) entry.current?.reset();
            form.current?.showModal();
          }}
        >
          Start a project <ActionArrow />
        </button>
        <span>
          Websites. Commerce. Connected systems.
          <br />
          {email ? (
            <a href={`mailto:${email}`}>{email}</a>
          ) : (
            <small>Example contact: hello@halenn.example</small>
          )}
        </span>
      </div>
      <dialog
        ref={form}
        className={s.dialog}
        aria-labelledby="contact-dialog-title"
        onCancel={(event) => {
          if (submission.pending) event.preventDefault();
        }}
        onClose={() => {
          submission.close();
          setEnquiryGoal("");
          setPreviewSaved(false);
        }}
      >
        <button
          className={s.close}
          aria-label="Close enquiry"
          disabled={submission.pending}
          onClick={() => form.current?.close()}
        >
          Close ×
        </button>
        <p className={s.kicker}>
          {email
            ? "Send your enquiry directly to Halenn."
            : "Local prototype / Nothing is sent"}
        </p>
        <h2 id="contact-dialog-title">Tell us about it.</h2>
        <form
          ref={entry}
          aria-busy={submission.pending}
          onInput={submission.firstInput}
          onInvalidCapture={submission.invalid}
          onSubmit={(event) => {
            event.preventDefault();
            if (!email) {
              setPreviewSaved(true);
              return;
            }
            const values = new FormData(event.currentTarget);
            void submission.submit({
              name: String(values.get("name") || ""),
              email: String(values.get("email") || ""),
              company: String(values.get("company") || ""),
              message: String(values.get("project") || ""),
              website: String(values.get("website") || ""),
            });
          }}
        >
          <label>
            Your name
            <input
              name="name"
              required
              autoComplete="name"
              maxLength={100}
              disabled={submission.pending || submission.sent}
            />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
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
            What are you planning?
            <textarea
              key={enquiryGoal}
              name="project"
              required
              rows={4}
              maxLength={5000}
              defaultValue={enquiryGoal}
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
          <p>
            Tell us about the task or idea. You don’t need to choose a solution
            yet.
          </p>
          <button
            type="submit"
            className={controls.action}
            disabled={submission.pending || submission.sent}
          >
            {!email
              ? "Preview enquiry"
              : submission.pending
                ? "Sending…"
                : submission.sent
                  ? "Enquiry received"
                  : "Send enquiry"}{" "}
            <ActionArrow />
          </button>
          {submission.error && <p role="alert">{submission.error}</p>}
          {submission.conflict && (
            <button
              type="button"
              onClick={() => {
                submission.restart();
                entry.current?.reset();
              }}
            >
              Start a new enquiry
            </button>
          )}
          {submission.sent && <p role="status">{enquiryReceivedMessage}</p>}
          {!email && previewSaved && (
            <p role="status">
              Your example enquiry is ready. This demo has not sent or stored
              your details.
            </p>
          )}
          {email && (
            <p>
              Prefer email? <a href={`mailto:${email}`}>{email}</a>. We use your
              details to respond to your enquiry.{" "}
              <a href="/privacy">Privacy policy</a>.
            </p>
          )}
        </form>
      </dialog>
    </section>
  );
}
