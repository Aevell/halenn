"use client";

import { useRef, useState } from "react";
import type { Lead } from "../../lib/leads";
import { Editor } from "./Forms";

type Format = "email" | "short";

function messageFor(lead: Lead, short: boolean) {
  const company = lead.company.trim();
  const opportunity = lead.opportunity.trim();
  const introduction = short
    ? "I'm reaching out from Halenn."
    : "I'm reaching out from Halenn. We build websites, webshops and apps, and help businesses automate everyday work.";
  const idea = opportunity
    ? `A possible starting point for ${company}:\n${opportunity}`
    : `I'd love to explore whether we could help ${company} with its website or day-to-day digital work.`;
  return [
    `Hi ${company} team,`,
    introduction,
    idea,
    "Would you be open to a quick chat to see if this would be useful?",
    short ? "Halenn · halenn.com" : "Best,\nThe Halenn team\nhttps://halenn.com",
  ].join("\n\n");
}

function Outreach({ lead }: { lead: Lead }) {
  const [format, setFormat] = useState<Format>("email");
  const [subject, setSubject] = useState(() => `An idea for ${lead.company}`);
  const [drafts, setDrafts] = useState(() => ({
    email: messageFor(lead, false),
    short: messageFor(lead, true),
  }));
  const [notice, setNotice] = useState("");
  const [copying, setCopying] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  const fallback = useRef<HTMLTextAreaElement>(null);
  const copiedText = format === "email" && subject.trim()
    ? `Subject: ${subject.trim()}\n\n${drafts[format]}`
    : drafts[format];

  async function copy() {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(copiedText);
      setNotice(format === "email" ? "Email copied, including the subject." : "Message copied.");
      setManualCopy(false);
    } catch {
      setManualCopy(true);
      setNotice("Clipboard access is blocked. Select and copy the text below.");
    } finally {
      setCopying(false);
    }
  }
  function edited() {
    setNotice("");
    setManualCopy(false);
  }
  return (
    <div className="hw-form hw-outreach">
      <p className="hw-outreach-intro">
        A starting point based on this lead. Make it yours before sending.
        Edits stay here while this dialog is open.
      </p>
      <div className="hw-services" role="group" aria-label="Message format">
        {(["email", "short"] as const).map((value) => (
          <button type="button" key={value} aria-pressed={format === value}
            onClick={() => { setFormat(value); edited(); }}>
            {value === "email" ? "Email" : "Short message"}
          </button>
        ))}
      </div>
      {format === "email" && (
        <label>
          Subject
          <input value={subject} maxLength={240}
            onChange={(e) => { setSubject(e.target.value); edited(); }} />
        </label>
      )}
      <label>
        Message
        <textarea aria-label="Message" rows={10} value={drafts[format]} maxLength={20000}
          onChange={(e) => { setDrafts({ ...drafts, [format]: e.target.value }); edited(); }} />
      </label>
      <footer>
        <span role="status">{notice}</span>
        <button type="button" className="hw-primary"
          disabled={copying || !drafts[format].trim()} onClick={copy}>
          {copying ? "Copying…" : format === "email" ? "Copy email" : "Copy message"}
        </button>
      </footer>
      {manualCopy && (
        <label>
          Copy manually
          <textarea aria-label="Copy manually" ref={fallback} readOnly rows={8} value={copiedText}
            onFocus={(e) => e.target.select()} />
          <button type="button" className="hw-quiet"
            onClick={() => { fallback.current?.focus(); fallback.current?.select(); }}>
            Select text
          </button>
        </label>
      )}
    </div>
  );
}

export default function LeadDetails({ lead, done }: {
  lead: Lead;
  done: (message: string) => void;
}) {
  const [view, setView] = useState<"details" | "outreach">("details");
  return (
    <>
      <div className="hw-switcher" role="group" aria-label="Lead views">
        <button type="button" aria-pressed={view === "details"} onClick={() => setView("details")}>
          Details
        </button>
        <button type="button" aria-pressed={view === "outreach"} onClick={() => setView("outreach")}>
          Outreach
        </button>
      </div>
      <div className="hw-workflow-panel" hidden={view !== "details"}>
        <Editor lead={lead} done={done} />
      </div>
      <div className="hw-workflow-panel" hidden={view !== "outreach"}>
        <Outreach lead={lead} />
      </div>
    </>
  );
}
