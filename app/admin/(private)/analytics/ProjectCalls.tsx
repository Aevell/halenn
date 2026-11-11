"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Lead } from "../../lib/leads";
import { parseProjectCallStatus, projectCallLanguage, upcomingProjectCalls, type ProjectCallStatus, type UnmatchedProjectCall } from "../../lib/project-calls";
import { Panel } from "./Charts";

function callTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam",
  }).format(new Date(value)) : "Time not available";
}

function CallMatch({ call, leads, onLinked, preview = false }: {
  call: UnmatchedProjectCall; leads: Lead[]; onLinked: () => Promise<void>; preview?: boolean;
}) {
  const [leadId, setLeadId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const lead = leads.find((item) => item.id === leadId);
  async function link() {
    if (!leadId || saving || preview) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/project-calls", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: call.id, leadId }),
      });
      const result = await response.json();
      if (!response.ok || result.linked !== true)
        throw Error(typeof result.error === "string" ? result.error : "The call could not be matched. Please try again.");
      await onLinked();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The call could not be matched. Please try again.");
    } finally { setSaving(false); }
  }
  return (
    <li className="ha-call-match">
      <div className="ha-call-identity">
        <strong>{call.attendeeName || call.attendeeEmail || "Name not provided"}</strong>
        {call.attendeeEmail && <span>{call.attendeeEmail}</span>}
        <span><b className={call.status === "cancelled" ? "ha-call-cancelled" : ""}>{call.status === "cancelled" ? "Cancelled" : "Booked"}</b> · {callTime(call.startsAt)}</span>
        <span>{projectCallLanguage(call.preferredLanguage)}</span>
        {call.status === "cancelled" && <small>Link for history only. This will not add a booking conversion.</small>}
      </div>
      <form className="ha-call-form" onSubmit={(event) => { event.preventDefault(); void link(); }}>
        <label className="ha-field">
          <span>Match to an existing lead</span>
          <select value={leadId} onChange={(event) => setLeadId(event.target.value)} required disabled={saving}>
            <option value="">Choose a lead…</option>
            {leads.map((item) => <option key={item.id} value={item.id}>
              {item.company}{item.contact ? ` · ${item.contact}` : ""}{item.is_test ? " · Test" : ""}
            </option>)}
          </select>
        </label>
        <button className="hw-quiet" type="submit" disabled={!leadId || saving || preview}>{saving ? "Matching…" : "Match call"}</button>
        {lead && <p className="ha-call-selected">{lead.company}{lead.contact ? ` · ${lead.contact}` : ""}{lead.is_test ? " · Test lead: excluded from analytics by default." : ""}</p>}
        {error && <p role="alert" className="ha-call-error">{error}</p>}
      </form>
    </li>
  );
}

export default function ProjectCalls({ leads, previewData, previewNow = 0 }: { leads: Lead[]; previewData?: ProjectCallStatus; previewNow?: number }) {
  const router = useRouter();
  const [loadedStatus, setStatus] = useState<ProjectCallStatus | null>(null);
  const status = previewData || loadedStatus;
  const [refreshedAt, setRefreshedAt] = useState(0);
  const [visibleCount, setVisibleCount] = useState(5);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const refresh = useCallback((signal?: AbortSignal) => {
    if (previewData) return Promise.resolve();
    return fetch("/api/admin/project-calls", { cache: "no-store", signal }).then(async (response) => {
      const data = await response.json();
      if (response.status === 401 || response.status === 403) setStatus(null);
      if (!response.ok) throw Error("Could not refresh project calls. Your other analytics are still available.");
      const next = data.available === true ? parseProjectCallStatus(data) : null;
      if (signal?.aborted) return;
      setStatus(next); setRefreshedAt(Date.now()); setMessage("");
    }).catch(() => {
      if (!signal?.aborted) setMessage("Could not refresh project calls. Your other analytics are still available.");
    }).finally(() => { if (!signal?.aborted) setLoading(false); });
  }, [previewData]);
  useEffect(() => {
    if (previewData) return;
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh, previewData]);

  async function linked() {
    setNotice("Call matched. The lead’s original source is unchanged.");
    router.refresh();
    await refresh();
  }

  const hasCalls = Boolean(status?.unmatched.length);
  const upcoming = upcomingProjectCalls(status, previewData ? previewNow : refreshedAt);
  if (!message && !notice && !hasCalls && !upcoming.length && (!status?.enabled || !status.configured)) return null;
  return <div className="ha-project-calls">
    <div className="ha-call-sync">
      <span>{previewData ? "Fictional project calls · preview only · matching disabled" : message || (status?.configured
        ? status.lastSyncAt ? `Project calls · last synced ${callTime(status.lastSyncAt)} (Amsterdam time)` : "Project calls connected · waiting for the first calendar sync"
        : "Project calls")}</span>
      {!previewData && <button className="ha-text-button" type="button" disabled={loading} onClick={() => { setLoading(true); void refresh(); }}>{loading ? "Refreshing…" : "Refresh list"}</button>}
    </div>
    {notice && <p className="ha-call-notice" role="status">{notice}</p>}
    {upcoming.length > 0 && <Panel title="Upcoming project calls"
      basis="Next 5 confirmed calls · Amsterdam time"
      description="One founder attends each call. Dutch calls are for Dave; English calls can be handled by Dave or Terence. Confirm attendance in the calendar.">
      <div className="ha-table-scroll"><table className="ha-upcoming-calls">
        <thead><tr><th>When</th><th>Customer</th><th>Language & founder</th></tr></thead>
        <tbody>{upcoming.map((call) => <tr key={call.id}>
          <td>{callTime(call.startsAt)}</td>
          <td><Link href={"/admin/leads?lead=" + call.leadId}>{leads.find((lead) => lead.id === call.leadId)?.company || call.attendeeName || call.attendeeEmail}</Link><small>{call.attendeeName}{call.attendeeName && call.attendeeEmail ? " · " : ""}{call.attendeeEmail}</small></td>
          <td>{projectCallLanguage(call.preferredLanguage)}</td>
        </tr>)}</tbody>
      </table></div>
    </Panel>}
    {hasCalls && <Panel title="Calls needing a lead match"
      basis="Recent unmatched calls · Amsterdam time"
      description="These calls could not be matched confidently. Choose the correct lead to preserve its original source. Unmatched calls are not included in lead conversion figures until matched.">
      <ul className="ha-call-list">{status!.unmatched.slice(0, visibleCount).map((call) =>
        <CallMatch key={call.id} call={call} leads={leads} onLinked={linked} preview={!!previewData} />
      )}</ul>
      {status!.unmatched.length > visibleCount && <button className="ha-text-button ha-call-more" type="button" onClick={() => setVisibleCount((count) => count + 5)}>Show more calls ({status!.unmatched.length - visibleCount} remaining)</button>}
    </Panel>}
  </div>;
}
