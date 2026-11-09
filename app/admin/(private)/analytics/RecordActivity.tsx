"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordActivity, voidActivity } from "../../analytics-actions";
import {
  activityLabels,
  moneyKinds,
  cents,
  type Entry,
  type EntryKind,
  type Activity,
} from "../../lib/analytics";
import { channels, type Lead } from "../../lib/leads";

export function AnalyticsDialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={"hw-dialog ha-dialog" + (wide ? " ha-dialog-wide" : "")}
      aria-labelledby="ha-dialog-heading"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="hw-dialog-head">
        <h2 id="ha-dialog-heading">{title}</h2>
        <button
          type="button"
          className="hw-close"
          aria-label="Close dialog"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
function localNow() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export default function RecordActivity({
  leads,
  initialLead,
  done,
  preview = false,
}: {
  leads: Lead[];
  initialLead?: string;
  done: (saved?: boolean) => void;
  preview?: boolean;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [kind, setKind] = useState<EntryKind>("contact_attempt");
  const [lead, setLead] = useState(initialLead ?? "");
  const [at, setAt] = useState(localNow);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Entry["currency"]>("EUR");
  const [channel, setChannel] = useState("Not recorded");
  const [owner, setOwner] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const selected = leads.find((l) => l.id === lead);
  return (
    <form
      className="hw-form ha-record-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        start(async () => {
          if (preview) {
            setError("This preview uses sample data. No records are saved.");
            return;
          }
          try {
            const time = new Date(at);
            if (!Number.isFinite(time.getTime())) {
              setError("Choose a valid date and time.");
              return;
            }
            const result = await recordActivity({
              id,
              lead_id: lead || null,
              kind,
              occurred_at: time.toISOString(),
              amount_cents: moneyKinds.includes(kind) ? cents(amount) : null,
              currency,
              channel: selected?.channel || channel,
              owner,
              note,
            });
            if (result.error) setError(result.error);
            else {
              router.refresh();
              done(true);
            }
          } catch {
            setError(
              "Could not save. Your entry is still here so you can retry.",
            );
          }
        });
      }}
    >
      <label>
        Activity
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as EntryKind)}
        >
          {Object.entries(activityLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Lead or customer
        <select
          required={kind !== "acquisition_cost"}
          value={lead}
          onChange={(e) => setLead(e.target.value)}
        >
          <option value="">
            {kind === "acquisition_cost"
              ? "Shared acquisition cost"
              : "Choose a lead"}
          </option>
          {[...leads]
            .sort((a, b) => a.company.localeCompare(b.company))
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.company}
              </option>
            ))}
        </select>
      </label>
      {!lead && kind === "acquisition_cost" && (
        <label>
          Acquisition source
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {channels.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      )}
      <label>
        When did it happen?
        <input
          required
          type="datetime-local"
          value={at}
          max={localNow()}
          onChange={(e) => setAt(e.target.value)}
        />
        <small>Use your local time. Reports use Europe/Amsterdam.</small>
      </label>
      {moneyKinds.includes(kind) && (
        <div className="hw-pair">
          <label>
            {kind.startsWith("subscription_")
              ? "New monthly total"
              : kind === "upsell"
                ? "Agreed upsell value"
                : "Amount"}
            <input
              required
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            Currency
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Entry["currency"])}
            >
              <option>EUR</option>
              <option>USD</option>
              <option>GBP</option>
            </select>
          </label>
        </div>
      )}
      {kind === "subscription_cancelled" && (
        <label>
          Subscription currency
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Entry["currency"])}
          >
            <option>EUR</option>
            <option>USD</option>
            <option>GBP</option>
          </select>
        </label>
      )}
      {kind.startsWith("subscription_") && (
        <p className="ha-form-note">
          Record the customer’s total monthly subscription in this currency. An
          update replaces the previous total. Subscription entries do not count
          as payments.
        </p>
      )}
      {kind === "upsell" && (
        <p className="ha-form-note">
          An agreed upsell is not collected revenue. Record the payment
          separately when it arrives.
        </p>
      )}
      {moneyKinds.includes(kind) && (
        <p className="ha-form-note">
          Use amounts excluding VAT or sales tax. Enter costs already incurred,
          including your delivery time if you want it reflected.
        </p>
      )}
      <label>
        Person responsible
        <input
          maxLength={120}
          placeholder={selected?.owner || "Optional"}
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        />
      </label>
      <label>
        {kind === "subscription_cancelled" ? "Cancellation reason" : "Note"}
        <textarea
          rows={2}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <p className="ha-form-note">
        This records what happened. Update the lead’s sales stage separately
        when it changes.
      </p>
      {error && <p role="alert">{error}</p>}
      <footer>
        <button type="button" className="hw-quiet" onClick={() => done(false)}>
          Cancel
        </button>
        <button className="hw-primary" disabled={pending}>
          {pending ? "Saving…" : "Save activity"}
        </button>
      </footer>
    </form>
  );
}
export function CorrectRecord({
  record,
  done,
  preview = false,
}: {
  record: Activity;
  done: (saved?: boolean) => void;
  preview?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="hw-form"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          if (preview)
            return setError("No records are changed in this sample preview.");
          try {
            const r = await voidActivity(record.id, reason);
            if (r.error) setError(r.error);
            else {
              router.refresh();
              done(true);
            }
          } catch {
            setError("Could not correct this record. Please retry.");
          }
        });
      }}
    >
      <p>
        This entry will be excluded from analytics. It stays in the activity
        history with your reason, and you can add a replacement entry.
      </p>
      <label>
        Reason for correction
        <textarea
          required
          maxLength={300}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <footer>
        <button type="button" className="hw-quiet" onClick={() => done(false)}>
          Cancel
        </button>
        <button className="hw-primary" disabled={pending}>
          {pending ? "Saving…" : "Exclude this entry"}
        </button>
      </footer>
    </form>
  );
}
