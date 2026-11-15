"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { quickUpdateLead } from "../../lead-quick-actions";
import { nextWeek } from "../../lib/follow-up";
import { dateLabel, type Lead } from "../../lib/leads";

export default function QuickActions({ lead, now }: { lead: Lead; now: string }) {
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();
  if (lead.status === "Won" || lead.status === "Closed") return null;
  const date = nextWeek(now);
  function update(action: "contacted" | "next-week") {
    setNotice("");
    setError(false);
    start(async () => {
      try {
        const result = await quickUpdateLead(lead.id, lead.revision, action);
        if (result.error) {
          setError(true);
          setNotice(result.error);
        } else {
          setNotice(action === "contacted" ? "Marked as contacted." : `Follow-up set for ${dateLabel(result.date!, now)}.`);
          router.refresh();
        }
      } catch {
        setError(true);
        setNotice("Could not save. Please try again.");
      }
    });
  }
  return (
    <div className="hw-quick-actions" role="group" aria-label={`Quick actions for ${lead.company}`} aria-busy={pending}>
      {lead.status === "New" && (
        <button type="button" disabled={pending} onClick={() => update("contacted")}>
          Mark contacted
        </button>
      )}
      <button type="button" disabled={pending || lead.follow_up === date}
        title={`Set follow-up to ${dateLabel(date, now)} (seven days from today)`}
        onClick={() => update("next-week")}>
        {lead.follow_up === date ? "Follow-up set" : "Follow up next week"}
        <span>{dateLabel(date, now)}</span>
      </button>
      {pending && <span role="status">Saving…</span>}
      {!pending && notice && <span role={error ? "alert" : "status"}>{notice}</span>}
      {error && <button type="button" onClick={() => { setNotice(""); setError(false); router.refresh(); }}>Refresh list</button>}
    </div>
  );
}
