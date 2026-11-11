import Link from "next/link";
import { leadAccess } from "../../lib/db";
import NotificationRecipient from "./NotificationRecipient";

type DeliveryCounts = {
  pending: number;
  accepted: number;
  attention: number;
  lastAcceptedAt: string | null;
};

type CustomerStatus = DeliveryCounts & {
  enabled: boolean;
  skipped: number;
  waitingForBooking: number;
  bookingSuppressed: number;
  bookingReview: number;
  hasBookingPolicy: boolean;
};
type NotificationStatus = DeliveryCounts & {
  enabled: boolean;
  configured: boolean;
  recipient: string;
  customer: CustomerStatus | null;
  callConfirmations: DeliveryCounts | null;
  combinedCallEmails: boolean;
};

function validCount(count: unknown): count is number {
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0;
}

function validCounts(status: Record<string, unknown>): boolean {
  return [status.pending, status.accepted, status.attention].every(validCount)
  && (status.lastAcceptedAt === null || (
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
  const bookingFields = ["waitingForBooking", "bookingSuppressed", "bookingReview"] as const;
  const customerValid = customer && typeof customer.enabled === "boolean" &&
    validCount(customer.skipped) && validCounts(customer) &&
    bookingFields.every((field) => customer[field] === undefined || validCount(customer[field]));
  return {
    ...status,
    callConfirmations: status.callConfirmations && typeof status.callConfirmations === "object" && validCounts(status.callConfirmations as Record<string, unknown>)
      ? status.callConfirmations as DeliveryCounts : null,
    combinedCallEmails: status.combinedCallEmails === true,
    customer: customerValid ? {
      ...customer,
      waitingForBooking: customer.waitingForBooking ?? 0,
      bookingSuppressed: customer.bookingSuppressed ?? 0,
      bookingReview: customer.bookingReview ?? 0,
      hasBookingPolicy: bookingFields.every((field) => validCount(customer[field])),
    } as CustomerStatus : null,
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
  const needsAttention = !!status && (status.attention > 0 || (status.customer?.attention ?? 0) > 0 || (status.callConfirmations?.attention ?? 0) > 0);
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
            ? <>{status.customer?.hasBookingPolicy
              ? "Customers receive an enquiry acknowledgement unless a matching booking covers it."
              : "Customers receive an acknowledgement after sending an enquiry."} Replies go to <strong>{status.recipient}</strong>.</>
            : "Automatic customer confirmations are not active. Enquiries are still saved in Leads."}</p>
          {status.customer && <>
            <Counts counts={status.customer} />
            {status.customer.hasBookingPolicy && <>
              <dl className="hw-notification-counts hw-notification-booking-counts" aria-label="Customer booking checks">
                <div><dt>Waiting for booking check</dt><dd>{status.customer.waitingForBooking.toLocaleString("en-GB")}</dd></div>
                <div><dt>Booking receipt only</dt><dd>{status.customer.bookingSuppressed.toLocaleString("en-GB")}</dd></div>
              </dl>
              <p className="hw-notification-note">New enquiry confirmations wait 15 minutes, then check the booking status. {status.combinedCallEmails ? "Customers booking through Halenn receive one call confirmation with their appointment details, enquiry summary and next steps." : "A matching booking uses Google’s booking confirmation only."}</p>
              <p className="hw-notification-note">If the enquiry confirmation has already been sent, a later booking still receives a call confirmation.</p>
              {status.customer.bookingReview > 0 && <p className="hw-notification-note">
                {status.customer.bookingReview.toLocaleString("en-GB")} booking {status.customer.bookingReview === 1 ? "check is" : "checks are"} included in Needs review.
              </p>}
            </>}
            <p className="hw-notification-note">
              {status.customer.skipped.toLocaleString("en-GB")} skipped by {status.customer.hasBookingPolicy ? "other delivery safeguards" : "delivery safeguards"}. Repeated submissions, unsupported addresses, older enquiries and daily limits can skip a confirmation; the enquiry itself is kept.
            </p>
            <p className="hw-notification-note">Up to 40 customer confirmations per 24 hours, with at most one per address per hour and three per day. Temporary sending problems are retried automatically.</p>
          </>}
        </section>
        {status.callConfirmations && (status.combinedCallEmails || status.callConfirmations.accepted > 0 || status.callConfirmations.pending > 0 || status.callConfirmations.attention > 0) && <section className="hw-customer-confirmations" aria-labelledby="call-confirmations-title">
          <h3 id="call-confirmations-title">Booked-call emails</h3>
          <Counts counts={status.callConfirmations} />
          <p className="hw-notification-note">Halenn sends the combined call confirmation. Appointment changes and cancellations receive their own update. Existing Google bookings keep their original confirmation.</p>
          {status.callConfirmations.attention > 0 && <p className="hw-notification-note">Check unresolved bookings and email delivery before contacting these customers.</p>}
        </section>}
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
