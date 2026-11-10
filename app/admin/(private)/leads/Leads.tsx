"use client";
import WorkspaceSelect from "../../WorkspaceSelect";
import { useRef, useState, useEffect, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Arrow } from "../../../components/halenn/Brand";
import { statuses, due, dateLabel, type Lead } from "../../lib/leads";
import { Editor } from "./Forms";
import Generate, { defaultRequest } from "./Generate";
function Dialog({
  title,
  drawer,
  onClose,
  children,
}: {
  title: string;
  drawer: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = prev;
    };
  }, []);
  function dismiss() {
    const el = ref.current;
    if (!el || el.dataset.closing) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches)
      return onClose();
    el.dataset.closing = "true";
    const exit = el.animate(
      [
        { opacity: 1, transform: "none" },
        {
          opacity: 0,
          transform: drawer ? "translateX(22px)" : "translateY(6px)",
        },
      ],
      { duration: 150, easing: "ease-out", fill: "forwards" },
    );
    exit.finished.then(onClose, () => {});
  }
  return (
    <dialog
      ref={ref}
      aria-labelledby="hw-dialog-title"
      className={"hw-dialog " + (drawer ? "hw-drawer" : "hw-import")}
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const b = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < b.left ||
            e.clientX > b.right ||
            e.clientY < b.top ||
            e.clientY > b.bottom
          )
            dismiss();
        }
      }}
    >
      <div className="hw-dialog-head">
        <h2 id="hw-dialog-title">{title}</h2>
        <button
          type="button"
          aria-label="Close"
          className="hw-close"
          onClick={dismiss}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function Leads({ leads, now }: { leads: Lead[]; now: string }) {
  const initial = useSearchParams();
  const [params, setParams] = useState(
    () => new URLSearchParams(initial.toString()),
  );
  useEffect(() => {
    const restore = () =>
      setParams(new URLSearchParams(window.location.search));
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const router = useRouter();
  const [, refresh] = useTransition();
  const [flash, setFlash] = useState("");
  const [mode, setMode] = useState<null | "add" | "generate">(null);
  const [request, setRequest] = useState(defaultRequest);
  const query = params.get("q") ?? "";
  const rawStatus = params.get("status");
  const status = statuses.find((s) => s === rawStatus) ?? "";
  const onlyDue = params.get("due") === "1";
  const selected = leads.find((l) => l.id === params.get("lead"));
  const modal = mode || selected;
  function change(values: Record<string, string>) {
    const next = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(values)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next);
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (next.size ? "?" + next : ""),
    );
  }
  function close() {
    setMode(null);
    change({ lead: "" });
  }
  function done(message: string) {
    close();
    setFlash(message);
    refresh(() => router.refresh());
  }
  const filtered = leads.filter(
    (l) =>
      (!status || l.status === status) &&
      (!onlyDue || due(l, now)) &&
      [l.company, l.website, l.opportunity].some((v) =>
        v.toLowerCase().includes(query.trim().toLowerCase()),
      ),
  );
  return (
    <section className="hw-enter">
      <div className="hw-titlebar">
        <h1>Leads</h1>
        <div className="hw-actions">
          <button className="hw-quiet" onClick={() => setMode("generate")}>
            Generate leads
          </button>
          <button className="hw-primary" onClick={() => setMode("add")}>
            <span aria-hidden="true">+</span> Add lead
          </button>
        </div>
      </div>
      <div className="hw-filters">
        <label className="hw-search">
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="5.5" stroke="currentColor" />
            <path d="m12 12 5 5" stroke="currentColor" />
          </svg>
          <input
            type="search"
            aria-label="Search leads"
            placeholder="Search leads"
            value={query}
            onChange={(e) => change({ q: e.target.value })}
          />
        </label>
        <WorkspaceSelect
          label="Filter by status"
          value={status || "All statuses"}
          options={["All statuses", ...statuses]}
          onChange={(value) =>
            change({ status: value === "All statuses" ? "" : value })
          }
        />
        <label className="hw-toggle">
          <input
            type="checkbox"
            checked={onlyDue}
            onChange={(e) => change({ due: e.target.checked ? "1" : "" })}
          />
          <i aria-hidden="true" />
          Follow-up due
        </label>
      </div>
      <div role="status" className="hw-flash">
        {flash}
      </div>
      {filtered.length ? (
        <>
          <div className="hw-list-head" aria-hidden="true">
            <span>Company</span>
            <span>Opportunity</span>
            <span>Status</span>
            <span>Next follow-up</span>
          </div>
          <ul className="hw-list">
            {filtered.map((l) => (
              <li key={l.id}>
                <button
                  className="hw-row"
                  onClick={() => change({ lead: l.id })}
                >
                  <span className="hw-company">
                    <b>{l.company}{l.is_test && <span className="hw-test-badge">Test</span>}</b>
                    {l.website && <small>{new URL(l.website).hostname}</small>}
                  </span>
                  <span className="hw-opp">{l.opportunity || "—"}</span>
                  <span className={"hw-status s-" + l.status.replaceAll(" ", "-")}>{l.status}</span>
                  <time className={due(l, now) ? "hw-due" : ""}>
                    {dateLabel(l.follow_up, now)}
                  </time>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="hw-empty">
          <h3>
            {leads.length ? "No matching leads" : "Your first lead starts here"}
          </h3>
          <p>
            {leads.length
              ? "Try a different search or clear the filters."
              : "Add a company or paste a batch to start your list."}
          </p>
          <button
            className="hw-text"
            onClick={() =>
              leads.length
                ? change({ q: "", status: "", due: "" })
                : setMode("add")
            }
          >
            {leads.length ? "Clear filters" : "Add a lead"} <Arrow />
          </button>
        </div>
      )}
      {modal && (
        <Dialog
          key={mode ?? selected?.id}
          drawer={mode !== "generate"}
          title={
            mode === "generate"
              ? "Generate leads"
              : mode === "add"
                ? "Add lead"
                : selected!.company
          }
          onClose={close}
        >
          {mode === "generate" ? (
            <Generate
              request={request}
              setRequest={setRequest}
              leads={leads}
              done={done}
              cancel={close}
            />
          ) : (
            <Editor lead={selected} done={done} />
          )}
        </Dialog>
      )}
    </section>
  );
}
