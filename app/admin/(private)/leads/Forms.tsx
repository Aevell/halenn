"use client";
import { useState, useTransition } from "react";
import { saveLead, importBatch } from "../../actions";
import {
  empty,
  columns,
  statuses,
  preview,
  type Fields,
  type Lead,
} from "../../lib/leads";
export function Editor({
  lead,
  done,
}: {
  lead?: Lead;
  done: (message: string) => void;
}) {
  const [fields, setFields] = useState<Fields>(() =>
    lead ? { ...lead } : { ...empty },
  );
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [revision] = useState(lead?.revision);
  const input = (k: keyof Fields, value: string) =>
    setFields((f) => ({ ...f, [k]: value }));
  return (
    <form
      className="hw-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        start(async () => {
          try {
            const r = await saveLead(
              fields,
              lead ? { id: lead.id, revision: revision! } : undefined,
            );
            if (r.error) setError(r.error);
            else done(lead ? "Changes saved." : "Lead added.");
          } catch {
            setError("Could not save. Your changes are still here.");
          }
        });
      }}
    >
      {(
        ["company", "website", "opportunity", "contact", "source"] as const
      ).map((k) => (
        <label key={k}>
          {
            {
              company: "Company",
              website: "Website",
              opportunity: "Opportunity",
              contact: "Contact",
              source: "Source URL",
            }[k]
          }
          <input
            required={k === "company"}
            maxLength={k === "company" ? 180 : 10000}
            value={fields[k]}
            onChange={(e) => input(k, e.target.value)}
          />
          {lead && (k === "website" || k === "source") && lead[k] && (
            <a
              className="hw-visit"
              href={lead[k]}
              target="_blank"
              rel="noreferrer"
            >
              Open {k === "source" ? "source" : "website"} ↗
            </a>
          )}
        </label>
      ))}
      <div className="hw-pair">
        <label>
          Status
          <select
            value={fields.status}
            onChange={(e) => input("status", e.target.value)}
          >
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Next follow-up
          <input
            type="date"
            value={fields.follow_up ?? ""}
            onChange={(e) => input("follow_up", e.target.value)}
          />
        </label>
      </div>
      <label>
        Notes
        <textarea
          aria-label="Notes"
          rows={3}
          maxLength={10000}
          value={fields.notes}
          onChange={(e) => input("notes", e.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <footer>
        <button className="hw-primary" disabled={pending}>
          {pending ? "Saving…" : lead ? "Save changes" : "Add lead"}
        </button>
      </footer>
    </form>
  );
}
export function ImportForm({
  leads,
  done,
  cancel,
}: {
  leads: Lead[];
  done: (message: string) => void;
  cancel: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const rows = preview(text, leads);
  const ready = rows.filter((r) => r.label === "Ready").length;
  return (
    <div className="hw-form">
      <label>
        Paste a tab-separated list
        <textarea
          aria-label="Paste a tab-separated list"
          maxLength={200000}
          rows={4}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError("");
          }}
          placeholder={columns.join("   ")}
        />
      </label>
      <button
        className="hw-text"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(columns.join("\t"));
            setCopied(true);
          } catch {
            setError("Copy these column names: " + columns.join(" · "));
          }
        }}
      >
        {copied ? "Template copied" : "Copy template"}
      </button>
      {rows.length > 0 && (
        <>
          <h3>Import preview</h3>
          <div className="hw-preview">
            {rows.slice(0, 200).map((r, i) => (
              <div key={i}>
                <b>{r.fields.company || "Missing company"}</b>
                <span>{r.label}</span>
              </div>
            ))}
          </div>
          <p>
            {ready} ready · {rows.length - ready} skipped
          </p>
        </>
      )}
      {rows.length > 200 && (
        <p role="alert">Import up to 200 rows at a time.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <footer>
        <button className="hw-quiet" onClick={cancel}>
          Cancel
        </button>
        <button
          className="hw-primary"
          disabled={!ready || rows.length > 200 || pending}
          onClick={() =>
            start(async () => {
              try {
                const r = await importBatch(text);
                if (r.error) setError(r.error);
                else done(`${r.count} imported · ${r.skipped} skipped.`);
              } catch {
                setError("Could not import. Your pasted rows are still here.");
              }
            })
          }
        >
          {pending
            ? "Importing…"
            : `Import ${ready || ""} ${ready === 1 ? "lead" : "leads"}`}
        </button>
      </footer>
    </div>
  );
}
