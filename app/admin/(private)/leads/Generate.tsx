"use client";
import { useState, useRef } from "react";
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
  const field = useRef<HTMLTextAreaElement>(null);
  const prompt = request.services.length ? build(request) : "";
  function change(patch: Partial<Request>) {
    setRequest({ ...request, ...patch });
    setNotice("");
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setNotice("Request copied.");
    } catch {
      field.current?.focus();
      field.current?.select();
      setNotice("Select and copy the request below.");
    }
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
          aria-pressed={view === "import"}
          onClick={() => setView("import")}
        >
          Import results
        </button>
      </div>
      <div hidden={view !== "build"}>
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
          <label>
            Lead count
            <select
              value={request.count}
              onChange={(e) => change({ count: Number(e.target.value) })}
            >
              {[5, 10, 20].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
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
            Request for ChatGPT
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
            <button className="hw-primary" disabled={!prompt} onClick={copy}>
              Copy request
            </button>
          </footer>
        </div>
      </div>
      <div hidden={view !== "import"}>
        <ImportForm leads={leads} done={done} cancel={cancel} />
      </div>
    </>
  );
}
