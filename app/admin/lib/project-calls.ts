export type UnmatchedProjectCall = {
  id: string;
  attendeeName: string;
  attendeeEmail: string;
  startsAt: string | null;
  endsAt: string | null;
  status: "confirmed" | "cancelled";
  bookedAt: string;
  preferredLanguage: "nl" | "en" | null;
};

export type UpcomingProjectCall = UnmatchedProjectCall & { leadId: string };

export type ProjectCallStatus = {
  enabled: boolean;
  configured: boolean;
  lastSyncAt: string | null;
  unmatched: UnmatchedProjectCall[];
  upcoming: UpcomingProjectCall[];
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const timestamp = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));

export function parseProjectCallLink(value: unknown) {
  if (
    !object(value) ||
    typeof value.bookingId !== "string" || !uuid.test(value.bookingId) ||
    typeof value.leadId !== "string" || !uuid.test(value.leadId) ||
    Object.keys(value).some((key) => !["bookingId", "leadId"].includes(key))
  ) throw Error("Choose a call and an existing lead.");
  return { bookingId: value.bookingId, leadId: value.leadId };
}

// Keep provider-only metadata out of the browser, including if the RPC grows later.
export function parseProjectCallStatus(value: unknown): ProjectCallStatus | null {
  if (
    !object(value) || typeof value.enabled !== "boolean" ||
    typeof value.configured !== "boolean" ||
    (value.lastSyncAt !== null && !timestamp(value.lastSyncAt)) ||
    !Array.isArray(value.unmatched)
  ) return null;
  function parseCall(call: unknown): UnmatchedProjectCall | null {
    if (
      !object(call) || typeof call.id !== "string" || !uuid.test(call.id) ||
      (call.attendeeName !== null && (typeof call.attendeeName !== "string" || call.attendeeName.length > 500)) ||
      (call.attendeeEmail !== null && (typeof call.attendeeEmail !== "string" || call.attendeeEmail.length > 320)) ||
      (call.status !== "confirmed" && call.status !== "cancelled") ||
      (call.startsAt !== null && !timestamp(call.startsAt)) ||
      (call.endsAt !== null && !timestamp(call.endsAt)) ||
      !timestamp(call.bookedAt)
    ) return null;
    return {
      id: call.id, attendeeName: call.attendeeName || "", attendeeEmail: call.attendeeEmail || "",
      startsAt: call.startsAt, endsAt: call.endsAt, status: call.status, bookedAt: call.bookedAt,
      preferredLanguage: call.preferredLanguage === "nl" || call.preferredLanguage === "en" ? call.preferredLanguage : null,
    };
  }
  const unmatched: UnmatchedProjectCall[] = [];
  for (const call of value.unmatched) {
    const parsed = parseCall(call);
    if (!parsed) return null;
    unmatched.push(parsed);
  }
  const upcoming: UpcomingProjectCall[] = [];
  if (value.upcoming !== undefined && !Array.isArray(value.upcoming)) return null;
  for (const call of value.upcoming ?? []) {
    const parsed = parseCall(call);
    if (!parsed || !object(call) || typeof call.leadId !== "string" || !uuid.test(call.leadId)) return null;
    upcoming.push({ ...parsed, leadId: call.leadId });
  }
  return { enabled: value.enabled, configured: value.configured, lastSyncAt: value.lastSyncAt, unmatched, upcoming };
}

export function projectCallLanguage(language: UnmatchedProjectCall["preferredLanguage"]) {
  if (language === "nl") return "Dutch · Dave";
  if (language === "en") return "English · Dave or Terence";
  return "Check language before assigning a founder";
}

export function upcomingProjectCalls(status: ProjectCallStatus | null, now: number) {
  return (status?.upcoming ?? [])
    .filter((call) => call.status === "confirmed" && call.startsAt && Date.parse(call.startsAt) > now)
    .sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!))
    .slice(0, 5);
}
