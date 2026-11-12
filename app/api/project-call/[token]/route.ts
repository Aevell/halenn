import { NextResponse, type NextRequest } from "next/server";
import { intakeDatabase, limitedJson, privateHeaders, sameOrigin } from "../../../lib/website-server";
import { projectCallToken } from "../../../lib/project-call-links";
import { callPortal } from "../../../lib/online-call";

export const maxDuration = 30;
const headers = { ...privateHeaders, "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
const reply = (data: object, status = 200) => NextResponse.json(data, { status, headers });
type Context = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  const { token } = await params;
  if (!projectCallToken(token)) return reply({ error: "This booking link is unavailable." }, 404);
  try {
    const { data, error } = await (await intakeDatabase()).rpc("halenn_online_call_portal", { token });
    const portal = !error && callPortal(data);
    return portal ? reply({ portal }) : reply({ error: "Booking is temporarily unavailable. Your enquiry is still with us." }, 503);
  } catch { return reply({ error: "We couldn’t check your appointment. Please try again." }, 503); }
}

export async function POST(request: NextRequest, { params }: Context) {
  const { token } = await params;
  if (!sameOrigin(request) || !projectCallToken(token)) return reply({ error: "Please use your Halenn booking page." }, 403);
  let input: Record<string, unknown>;
  try {
    const raw = await limitedJson(request, 2048);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error();
    input = raw as Record<string, unknown>;
    if (!["availability", "book", "cancel", "reschedule"].includes(String(input.operation))) throw Error();
    for (const key of ["day", "startsAt", "language"]) if (input[key] != null && (typeof input[key] !== "string" || String(input[key]).length > 40)) throw Error();
  } catch { return reply({ error: "Please check your appointment details." }, 400); }
  try {
    const db = await intakeDatabase();
    const { data, error } = await db.rpc("halenn_prepare_online_call", {
      token, operation: input.operation, day: input.day ?? null,
      starts_at: input.startsAt ?? null, preferred_language: input.language ?? null,
    });
    if (error) return reply({ error: error.code === "54000" ? "Please wait a moment before trying again. You can also arrange a call when we reply by email."
      : error.code === "22023" ? "Please choose an available time and language." : "Online booking is temporarily unavailable. Your enquiry is still with us." }, error.code === "54000" ? 429 : 503);
    const existing = callPortal(data?.portal);
    if (existing) return reply({ portal: existing });
    if (typeof data?.endpoint !== "string" || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(data.endpoint)
      || typeof data.envelope?.body !== "string") throw Error();
    const response = await fetch(data.endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data.envelope),
      cache: "no-store", signal: AbortSignal.timeout(23_000),
    });
    const signed = await limitedJson(response, 40_000) as Record<string, unknown>;
    if (!response.ok || typeof signed.body !== "string" || typeof signed.signature !== "string" || typeof signed.sentAt !== "string") throw Error();
    // Never trust a provider response until the database verifies its exact bytes.
    const finished = await db.rpc("halenn_finish_online_call", { raw_body: signed.body, signature: signed.signature, sent_at: signed.sentAt });
    if (finished.error) throw Error();
    if (input.operation === "availability") {
      const prepared = JSON.parse(data.envelope.body);
      if (finished.data?.requestId !== prepared.requestId || !Array.isArray(finished.data?.slots)) throw Error();
      return reply({ slots: finished.data.slots });
    }
    const state = await db.rpc("halenn_online_call_portal", { token });
    const portal = !state.error && callPortal(state.data);
    if (!portal) throw Error();
    return reply({ portal });
  } catch {
    // The calendar may have committed before a connection timeout. Do not tell
    // customers to create another enquiry or claim the booking failed.
    return reply({ error: input.operation === "availability"
      ? "We couldn’t load available times. Please try again."
      : "We’re checking your appointment. Keep this page open, or return to this link in a moment.", checking: input.operation !== "availability" }, 503);
  }
}
