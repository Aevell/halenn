export type CallPortal = {
  available: boolean;
  status?: "new" | "pending" | "confirmed" | "unavailable" | "cancelled" | "review";
  startsAt?: string | null;
  language?: "nl" | "en" | null;
  meetUrl?: string | null;
  cancelRequested?: boolean;
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
  const { available, status, startsAt, language, meetUrl, cancelRequested } = v;
  return { available, status, startsAt, language, meetUrl, cancelRequested } as CallPortal;
}

export function callCalendar(startsAt: string, meetUrl: string, token: string) {
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const start = new Date(startsAt);
  // A downloadable calendar entry, not a second emailed invitation.
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Halenn//Project calls//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:${token}-${stamp(start)}@halenn.com`, `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + 30 * 60_000))}`,
    "SUMMARY:Halenn project call", `LOCATION:${meetUrl}`, `URL:${meetUrl}`,
    "DESCRIPTION:A 30-minute conversation about your enquiry and next steps.", "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
}
