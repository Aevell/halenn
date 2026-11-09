import Link from "next/link";
import { leadAccess } from "../../lib/db";
import NotificationRecipient from "./NotificationRecipient";

type DeliveryCounts = {
  pending: number;
  accepted: number;
  attention: number;
  lastAcceptedAt: string | null;
};

type CustomerStatus = DeliveryCounts & { enabled: boolean; skipped: number };
type NotificationStatus = DeliveryCounts & {
  enabled: boolean;
  configured: boolean;
  recipient: string;
  customer: CustomerStatus | null;
};

function validCounts(status: Record<string, unknown>): boolean {
  return [status.pending, status.accepted, status.attention].every(
    (count) => typeof count === "number" && Number.isSafeInteger(count) && count >= 0,
  ) && (status.lastAcceptedAt === null || (
    typeof status.lastAcceptedAt === "string" &&
    Number.isFinite(Date.parse(status.lastAcceptedAt))
  ));
}

function readStatus(value: unknown): NotificationStatus | null {
  if (!value || typeof value !== "object") return null;
  const status = value as Record<string, unknown>;
  if (
    typeof status.enabled !== "boolean" ||
    typeof status.configured !== "boolean" ||
    typeof status.recipient !== "string" ||
    !validCounts(status)
  ) return null;
  const customer = status.customer && typeof status.customer === "object"
    ? status.customer as Record<string, unknown> : null;
  return {
    ...status,
    customer: customer && typeof customer.enabled === "boolean" &&
      typeof customer.skipped === "number" && Number.isSafeInteger(customer.skipped) &&
      customer.skipped >= 0 && validCounts(customer) ? customer as CustomerStatus : null,
  } as NotificationStatus;
}

function Counts({ counts }: { counts: DeliveryCounts }) {
  return (
    <dl className="hw-notification-counts">
      <div><dt>Queued</dt><dd>{counts.pending.toLocaleString("en-GB")}</dd></div>
      <div><dt>Accepted</dt><dd>{counts.accepted.toLocaleString("en-GB")}</dd></div>
      <div><dt>Needs review</dt><dd>{counts.attention.toLocaleString("en-GB")}</dd></div>
    </dl>
  );
}

export default async function EnquiryNotifications() {
  const { db } = await leadAccess();
  const { data, error } = await db.rpc("halenn_enquiry_notification_status");
  const status = error ? null : readStatus(data);
  const active = status?.enabled && status.configured;
  const customerActive = active && status?.customer?.enabled;
  const needsAttention = !!status && (status.attention > 0 || (status.customer?.attention ?? 0) > 0);
  const label = !status ? "Status unavailable"
    : needsAttention ? "Needs attention"
    : !status.configured ? "Setup needed"
    : !status.enabled ? "Paused"
    : "Enabled";

  return (
    <section className="hw-notifications" aria-labelledby="enquiry-notifications-title">
      <header>
        <h2 id="enquiry-notifications-title">Enquiry emails</h2>
        <span className={`hw-notification-state${active && !needsAttention ? " is-active" : ""}`}>{label}</span>
      </header>
      <p>{status
        ? <>Website enquiry notifications go to <strong>{status.recipient}</strong>.</>
        : "Email status could not be loaded. Check Leads for new website enquiries."}</p>
      {status && <>
        <NotificationRecipient recipient={status.recipient} />
        <h3 className="hw-notification-subtitle">Your inbox</h3>
        <Counts counts={status} />
        <p className="hw-notification-note">
          {!active
            ? "Sending is not active. New enquiries remain available in Leads."
            : status.attention > 0
              ? "Some notifications need checking in Resend or the sending configuration. Their enquiries remain available in Leads."
              : "Temporary sending problems are retried automatically. Enquiries remain available in Leads."}
        </p>
        <section className="hw-customer-confirmations" aria-labelledby="customer-confirmations-title">
          <header>
            <h3 id="customer-confirmations-title">Customer confirmations</h3>
            <span className={`hw-notification-state${customerActive && status.customer?.attention === 0 ? " is-active" : ""}`}>
              {!status.customer ? "Setup needed" : status.customer.attention > 0 ? "Needs attention" : customerActive ? "Enabled" : "Paused"}
            </span>
          </header>
          <p>{customerActive
            ? <>Customers receive an acknowledgement after sending an enquiry. Replies go to <strong>{status.recipient}</strong>.</>
            : "Automatic customer confirmations are not active. Enquiries are still saved in Leads."}</p>
          {status.customer && <>
            <Counts counts={status.customer} />
            <p className="hw-notification-note">
              {status.customer.skipped.toLocaleString("en-GB")} skipped by delivery safeguards. Repeated submissions, unsupported addresses, older enquiries and daily limits can skip a confirmation; the enquiry itself is kept.
            </p>
            <p className="hw-notification-note">Up to 40 customer confirmations per 24 hours, with at most one per address per hour and three per day. Temporary sending problems are retried automatically.</p>
          </>}
        </section>
        <p className="hw-notification-note">
          Accepted means Resend accepted the email for sending; it does not confirm inbox delivery.
          {status.lastAcceptedAt && <> Your inbox last accepted: <time dateTime={status.lastAcceptedAt}>{new Intl.DateTimeFormat("en-GB", {
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
