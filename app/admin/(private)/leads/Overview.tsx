"use client";

import { useState } from "react";
import { dateLabel, due, type Lead } from "../../lib/leads";
import { mapEmbed } from "../../lib/maps";
import QuickActions from "./QuickActions";

export default function Overview({ lead, now, active, edit }: {
  lead: Lead; now: string; active: boolean; edit: () => void;
}) {
  const [hideMap, setHideMap] = useState(false);
  let embed = "";
  try { embed = mapEmbed(lead.maps_embed); } catch { /* Invalid legacy data uses the identity panel. */ }
  const initials = lead.company.trim().split(/\s+/).slice(0, 2).map(word => [...word][0]).join("").toUpperCase();
  const domain = lead.website ? new URL(lead.website).hostname.replace(/^www\./, "") : "";
  return (
    <div className="hw-lead-overview">
      {embed && !hideMap ? (
        <div className="hw-lead-map">
          {active && <iframe src={embed} title={`Google Maps location for ${lead.company}`}
            referrerPolicy="no-referrer" loading="lazy" allowFullScreen />}
          <div className="hw-map-caption">
            <span>Google Maps</span>
            <button type="button" className="hw-text" onClick={() => setHideMap(true)}>Hide map</button>
          </div>
        </div>
      ) : (
        <div className="hw-company-panel">
          <span className="hw-company-initials" aria-hidden="true">{initials}</span>
          <div>
            <h3>{lead.company}</h3>
            <p>{lead.industry || domain || "Company overview"}</p>
          </div>
        </div>
      )}
      <div className="hw-overview-links">
        {lead.website && <a className="hw-visit" href={lead.website} target="_blank" rel="noreferrer">Visit website ↗</a>}
        {embed && hideMap && <button type="button" className="hw-text" onClick={() => setHideMap(false)}>Show map</button>}
        <button type="button" className="hw-text" onClick={edit}>{embed ? "Edit details" : "Edit details / add map"}</button>
      </div>
      <div className="hw-lead-facts">
        <div>
          <span>Status</span>
          <span className={`hw-status s-${lead.status.replaceAll(" ", "-")}`}>{lead.status}</span>
        </div>
        <div>
          <span>Next follow-up</span>
          <time className={due(lead, now) ? "hw-due" : ""} dateTime={lead.follow_up || undefined}>
            {lead.follow_up ? dateLabel(lead.follow_up, now) : "Not scheduled"}
          </time>
        </div>
      </div>
      <QuickActions lead={lead} now={now} />
      <section className="hw-lead-opportunity">
        <h3>Opportunity</h3>
        <p>{lead.opportunity || "Add a specific opportunity to guide your outreach."}</p>
        {lead.source && <a className="hw-visit" href={lead.source} target="_blank" rel="noreferrer">View supporting source ↗</a>}
      </section>
      <dl className="hw-lead-contact">
        <div><dt>Contact</dt><dd>{lead.contact || "No contact recorded"}</dd></div>
        {lead.service && lead.service !== "Not recorded" && <div><dt>Service</dt><dd>{lead.service}</dd></div>}
        {lead.owner && <div><dt>Lead owner</dt><dd>{lead.owner}</dd></div>}
      </dl>
      {lead.notes && <details className="hw-overview-notes"><summary>Notes</summary><p>{lead.notes}</p></details>}
    </div>
  );
}
