import Link from "next/link";
import { leadAccess } from "../../lib/db";

type NotificationStatus = {
  enabled: boolean;
  configured: boolean;
  recipient: string;
  pending: number;
  accepted: number;
  attention: number;
  lastAcceptedAt: string | null;
};

function readStatus(value: unknown): NotificationStatus | null {
  if (!value || typeof value !== "object") return null;
  const status = value as Record<string, unknown>;
  if (
    typeof status.enabled !== "boolean" ||
    typeof status.configured !== "boolean" ||
    typeof status.recipient !== "string" ||
    ![status.pending, status.accepted, status.attention].every(
      (count) => typeof count === "number" && Number.isSafeInteger(count) && count >= 0,
    ) ||
    !(status.lastAcceptedAt === null || (
      typeof status.lastAcceptedAt === "string" &&
      Number.isFinite(Date.parse(status.lastAcceptedAt))
    ))
  ) return null;
  return status as NotificationStatus;
}

export default async function EnquiryNotifications() {
  const { db } = await leadAccess();
  const { data, error } = await db.rpc("halenn_enquiry_notification_status");
  const status = error ? null : readStatus(data);
  const active = status?.enabled && status.configured;
  const label = !status ? "Status unavailable"
    : status.attention > 0 ? "Needs attention"
    : !status.configured ? "Setup needed"
    : !status.enabled ? "Paused"
    : "Enabled";

  return (
    <section className="hw-notifications" aria-labelledby="enquiry-notifications-title">
      <header>
        <h2 id="enquiry-notifications-title">Enquiry emails</h2>
        <span className={`hw-notification-state${active && status?.attention === 0 ? " is-active" : ""}`}>{label}</span>
      </header>
      <p>{status
        ? <>Website enquiry notifications go to <strong>{status.recipient}</strong>.</>
        : "Email status could not be loaded. Check Leads for new website enquiries."}</p>
      {status && <>
        <dl className="hw-notification-counts">
          <div><dt>Queued</dt><dd>{status.pending.toLocaleString("en-GB")}</dd></div>
          <div><dt>Accepted</dt><dd>{status.accepted.toLocaleString("en-GB")}</dd></div>
          <div><dt>Needs review</dt><dd>{status.attention.toLocaleString("en-GB")}</dd></div>
        </dl>
        <p className="hw-notification-note">
          {!active
            ? "Sending is not active. New enquiries remain available in Leads."
            : status.attention > 0
              ? "Some notifications need checking in Resend or the sending configuration. Their enquiries remain available in Leads."
              : "Temporary sending problems are retried automatically. Enquiries remain available in Leads."}
        </p>
        <p className="hw-notification-note">
          Accepted means Resend accepted the email for sending; it does not confirm inbox delivery.
          {status.lastAcceptedAt && <> Last accepted: <time dateTime={status.lastAcceptedAt}>{new Intl.DateTimeFormat("en-GB", {
            dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam",
          }).format(new Date(status.lastAcceptedAt))}</time> (Amsterdam).</>}
        </p>
      </>}
      <nav aria-label="Enquiry email actions">
        <Link href="/admin/leads">View leads</Link>
        <a href="/admin/account">Refresh status</a>
        <a href="https://resend.com/emails" target="_blank" rel="noopener noreferrer">Open Resend ↗</a>
      </nav>
    </section>
  );
}
