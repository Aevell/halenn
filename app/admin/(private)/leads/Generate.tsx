"use client";
import WorkspaceSelect from "../../WorkspaceSelect";
import { useState, useRef } from "react";
import { flushSync } from "react-dom";
import { columns, type Lead } from "../../lib/leads";
import { ImportForm } from "./Forms";

const services = {
  Websites: "website design",
  Webshops: "webshop development",
  Apps: "app development",
  "AI automation": "AI automation",
};
type Service = keyof typeof services;
const choices = Object.keys(services) as Service[];
export const defaultRequest = {
  location: "Netherlands",
  business: "",
  services: choices,
  count: 10,
  independent: false,
  contact: false,
};
type Request = typeof defaultRequest;

function build(r: Request) {
  const region = r.location.trim();
  const place =
    region.toLowerCase() === "netherlands" ? "the Netherlands" : region;
  return [
    `Find up to ${r.count} ${r.independent ? "independent " : ""}${r.business.trim() || "businesses"}${place ? " in " + place : ""} that could benefit from Halenn’s services. Focus on ${new Intl.ListFormat("en", { type: "disjunction" }).format(r.services.map((s) => services[s]))}.`,
    `For each company, describe one specific opportunity you can verify on a public page, explain which selected service would help, and include that page’s URL. ${r.contact ? "Only include companies with a published business contact and provide it." : "Include a published business contact when available."} Leave unknown fields blank, never guess contact details, and return fewer leads if fewer qualify.`,
    `Return one tab-separated code block with this exact header:\n${columns.join("\t")}\nUse actual tabs between fields and one line per company. Keep blank fields in their original positions.\n\nIf no leads qualify, return only the header.`,
  ].join("\n\n");
}

export default function Generate({
  request,
  setRequest,
  leads,
  done,
  cancel,
}: {
  request: Request;
  setRequest: (v: Request) => void;
  leads: Lead[];
  done: (message: string) => void;
  cancel: () => void;
}) {
  const [view, setView] = useState<"build" | "import">("build");
  const [notice, setNotice] = useState("");
  const [copiedRequest, setCopiedRequest] = useState("");
  const [copying, setCopying] = useState(false);
  const importButton = useRef<HTMLButtonElement>(null);
  const codexLink = useRef<HTMLAnchorElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const prompt = request.services.length ? build(request) : "";
  function change(patch: Partial<Request>) {
    setRequest({ ...request, ...patch });
    setNotice("");
  }
  async function copy() {
    if (!prompt || copying) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      field.current?.focus();
      field.current?.select();
      setNotice("Select and copy the request below.");
      setCopying(false);
      return;
    }
    // Commit the import view before handing focus to the desktop app.
    flushSync(() => {
      setCopiedRequest(prompt);
      setNotice("");
      setView("import");
      setCopying(false);
    });
    importButton.current?.focus();
    codexLink.current?.click();
  }
  return (
    <>
      <div role="group" aria-label="Lead workflow" className="hw-switcher">
        <button
          aria-pressed={view === "build"}
          onClick={() => setView("build")}
        >
          Build request
        </button>
        <button
          ref={importButton}
          aria-pressed={view === "import"}
          onClick={() => setView("import")}
        >
          Import results
        </button>
      </div>
      <div className="hw-workflow-panel" hidden={view !== "build"}>
        <div className="hw-form hw-builder">
          <div className="hw-pair">
            <label>
              Location
              <input
                value={request.location}
                onChange={(e) => change({ location: e.target.value })}
              />
            </label>
            <label>
              Business type
              <input
                placeholder="Any business type"
                value={request.business}
                onChange={(e) => change({ business: e.target.value })}
              />
            </label>
          </div>
          <fieldset>
            <legend>Halenn services</legend>
            <div className="hw-services">
              {choices.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={request.services.includes(s)}
                  onClick={() =>
                    change({
                      services: choices.filter((x) =>
                        x === s
                          ? !request.services.includes(s)
                          : request.services.includes(x),
                      ),
                    })
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </fieldset>
          <WorkspaceSelect
            label="Lead count"
            showLabel
            value={String(request.count)}
            options={["5", "10", "20"]}
            onChange={(value) => change({ count: Number(value) })}
          />
          <div className="hw-options">
            {(
              [
                ["independent", "Only independent businesses"],
                ["contact", "Require a published business contact"],
              ] as const
            ).map(([key, label]) => (
              <label className="hw-toggle" key={key}>
                <input
                  type="checkbox"
                  checked={request[key]}
                  onChange={(e) => change({ [key]: e.target.checked })}
                />
                <i aria-hidden="true" />
                {label}
              </label>
            ))}
          </div>
          <label>
            Request for Codex
            <textarea
              ref={field}
              readOnly
              value={prompt}
              rows={5}
              placeholder="Select a service to build your request."
            />
          </label>
          <footer>
            <span role="status">{notice}</span>
            <button className="hw-primary" disabled={!prompt || copying} onClick={copy}>
              {copying ? "Copying…" : "Copy & open Codex"}
            </button>
          </footer>
        </div>
      </div>
      <div className="hw-workflow-panel" hidden={view !== "import"}>
        {copiedRequest && (
          <div className="hw-handoff">
            <p role="status">Request copied. Send it in Codex, then paste the results below.</p>
            <p>
              Didn’t open?{" "}
              <a ref={codexLink} href={`codex://threads/new?prompt=${encodeURIComponent(copiedRequest)}`}>
                Open Codex
              </a>
              {" "}or paste the copied request into your chat.
            </p>
          </div>
        )}
        <ImportForm leads={leads} done={done} cancel={cancel} />
      </div>
    </>
  );
}
