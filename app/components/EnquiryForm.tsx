"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import s from "./enquiry-form.module.css";

export default function EnquiryForm({ context, initialMessage = "", buttonClassName, arrow, preview = false }: {
  context: string;
  initialMessage?: string;
  buttonClassName: string;
  arrow?: ReactNode;
  preview?: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const inFlight = useRef(false);
  const attempt = useRef({ contents: "", id: "" });
  const result = useRef<HTMLDivElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    if (preview) { setStatus("success"); return; }
    const fields = new FormData(form);
    const data = {
      name: String(fields.get("name") ?? "").trim(),
      email: String(fields.get("email") ?? "").trim(),
      message: String(fields.get("message") ?? "").trim(),
      website: String(fields.get("website") ?? ""),
      context,
    };
    const contents = JSON.stringify(data);
    if (attempt.current.contents !== contents) attempt.current = { contents, id: crypto.randomUUID() };
    inFlight.current = true;
    setStatus("sending");
    setError("");
    try {
      const response = await fetch("/api/enquiries", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, requestId: attempt.current.id }),
        signal: AbortSignal.timeout(15_000),
      });
      const outcome = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || outcome.ok !== true) throw new Error(outcome.error || "We couldn’t send your enquiry. Please try again.");
      setReplyEmail(data.email);
      setStatus("success");
      requestAnimationFrame(() => result.current?.focus());
    } catch (reason) {
      setStatus("error");
      setError(reason instanceof Error && reason.name !== "TimeoutError" && reason.name !== "TypeError"
        ? reason.message : "We couldn’t confirm your enquiry was sent. Your details are still here. Please try again.");
    } finally { inFlight.current = false; }
  }

  if (status === "success") return <div className={s.success} ref={result} tabIndex={-1} role="status">
    <strong>{preview ? "Your example enquiry is ready." : "Thanks. Your enquiry has been submitted."}</strong>
    <p>{preview ? "This prototype has not sent or stored your details." : <>We’ll reply to <span>{replyEmail}</span> about your project.</>}</p>
  </div>;

  return <form onSubmit={submit} aria-busy={status === "sending"}>
    <label>Your name<input name="name" required maxLength={100} autoComplete="name" readOnly={status === "sending"} /></label>
    <label>Email<input name="email" type="email" required maxLength={254} autoComplete="email" readOnly={status === "sending"} /></label>
    <label>What are you planning?<textarea name="message" required minLength={10} maxLength={3000} rows={4} defaultValue={initialMessage} readOnly={status === "sending"} /></label>
    <div className={s.honey} aria-hidden="true"><label>Leave this field empty<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    {error && <p role="alert" className={s.error}>{error} You can also email <a href="mailto:contact@halenn.com">contact@halenn.com</a>.</p>}
    <button type="submit" className={buttonClassName} disabled={status === "sending"}>
      {status === "sending" ? "Sending…" : preview ? "Preview enquiry" : "Send enquiry"}{arrow}
    </button>
    <p className={s.note}>{preview ? "Prototype preview. Nothing will be sent." : "We’ll use your details to respond to your enquiry."}</p>
  </form>;
}
