export type CallPortal = {
  available: boolean;
  status?: "new" | "pending" | "confirmed" | "unavailable" | "cancelled" | "review";
  startsAt?: string | null;
  language?: "nl" | "en" | null;
  meetUrl?: string | null;
  cancelRequested?: boolean;
  canReschedule?: boolean;
  reschedulePending?: boolean;
  rescheduleOutcome?: "confirmed" | "unavailable" | "conflict" | null;
  rescheduleId?: string | null;
  updatedAt?: string | null;
  calendarSequence?: number;
};

export function callPortal(value: unknown): CallPortal | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.available !== "boolean") return null;
  if (v.status !== undefined && !["new", "pending", "confirmed", "unavailable", "cancelled", "review"].includes(String(v.status))) return null;
  if (v.startsAt != null && (typeof v.startsAt !== "string" || !Number.isFinite(Date.parse(v.startsAt)))) return null;
  if (v.language != null && v.language !== "nl" && v.language !== "en") return null;
  if (v.meetUrl != null && (typeof v.meetUrl !== "string" || !/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(v.meetUrl))) return null;
  if (v.cancelRequested !== undefined && typeof v.cancelRequested !== "boolean") return null;
  for (const key of ["canReschedule", "reschedulePending"]) if (v[key] !== undefined && typeof v[key] !== "boolean") return null;
  if (v.rescheduleOutcome != null && !["confirmed", "unavailable", "conflict"].includes(String(v.rescheduleOutcome))) return null;
  if (v.rescheduleId != null && (typeof v.rescheduleId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v.rescheduleId))) return null;
  if (v.updatedAt != null && (typeof v.updatedAt !== "string" || !Number.isFinite(Date.parse(v.updatedAt)))) return null;
  if (v.calendarSequence !== undefined && (!Number.isInteger(v.calendarSequence) || Number(v.calendarSequence) < 0 || Number(v.calendarSequence) > 2147483647)) return null;
  const { available, status, startsAt, language, meetUrl, cancelRequested, canReschedule, reschedulePending, rescheduleOutcome, rescheduleId, updatedAt, calendarSequence } = v;
  return { available, status, startsAt, language, meetUrl, cancelRequested, canReschedule, reschedulePending, rescheduleOutcome, rescheduleId, updatedAt, calendarSequence } as CallPortal;
}

export function callCalendar(startsAt: string, meetUrl: string, token: string, sequence = 0, updatedAt?: string | null) {
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const start = new Date(startsAt);
  // A downloadable calendar entry, not a second emailed invitation.
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Halenn//Project calls//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:${token}@halenn.com`, `SEQUENCE:${sequence}`, `DTSTAMP:${stamp(updatedAt ? new Date(updatedAt) : new Date())}`,
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + 30 * 60_000))}`,
    "SUMMARY:Halenn project call", `LOCATION:${meetUrl}`, `URL:${meetUrl}`,
    "DESCRIPTION:A 30-minute conversation about your enquiry and next steps.", "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
}
