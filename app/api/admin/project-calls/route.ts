import { NextResponse, type NextRequest } from "next/server";
import { database } from "../../../admin/lib/db";
import { parseProjectCallLink, parseProjectCallStatus } from "../../../admin/lib/project-calls";
import { limitedJson, privateHeaders, sameOrigin } from "../../../lib/website-server";

export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: privateHeaders });
const unavailable = () => reply({ available: false });
const missingRpc = (code: string) => ["PGRST202", "42883"].includes(code);

async function access() {
  const db = await database();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { response: reply({ error: "Please sign in again." }, 401) };
  const { data: founder, error: founderError } = await db.rpc("halenn_is_founder");
  if (founderError) return { response: reply({ error: "Access could not be checked. Please try again." }, 503) };
  if (founder !== true) return { response: reply({ error: "Founder access is required." }, 403) };
  const { data: needsPassword, error: passwordError } = await db.rpc("halenn_needs_password");
  if (passwordError) return { response: reply({ error: "Access could not be checked. Please try again." }, 503) };
  if (needsPassword !== false) return { response: reply({ error: "Complete your account setup first." }, 403) };
  return { db };
}

export async function GET() {
  try {
    const account = await access();
    if (account.response) return account.response;
    const { data, error } = await account.db!.rpc("halenn_project_call_status");
    if (error) {
      if (error.code === "42501") return reply({ error: "Founder access is required." }, 403);
      if (missingRpc(error.code)) return unavailable();
      return reply({ error: "Project call updates are temporarily unavailable." }, 503);
    }
    const status = parseProjectCallStatus(data);
    if (!status) return unavailable();
    return reply({ available: true, ...status });
  } catch {
    return reply({ error: "Project call updates are temporarily unavailable." }, 503);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reply({ error: "Refresh the page and try again." }, 403);
  try {
    const account = await access();
    if (account.response) return account.response;
    let input;
    try { input = parseProjectCallLink(await limitedJson(request, 1024)); }
    catch { return reply({ error: "Choose a call and an existing lead." }, 400); }
    const { data, error } = await account.db!.rpc("halenn_link_project_call", {
      booking_id: input.bookingId, lead_id: input.leadId,
    });
    if (error) {
      if (error.code === "42501") return reply({ error: "Founder access is required." }, 403);
      if (missingRpc(error.code)) return reply({ error: "Call matching will be available once the calendar connection is ready." }, 503);
      if (["P0001", "P0002", "22023", "23503", "23505"].includes(error.code))
        return reply({ error: "This call or lead has changed. Refresh the call list and check the match." }, 409);
      return reply({ error: "The call could not be matched. Please try again." }, 503);
    }
    if (data?.linked !== true) return reply({ error: "The match could not be confirmed. Refresh the call list and check the lead." }, 503);
    return reply({ linked: true });
  } catch {
    return reply({ error: "The call could not be matched. Please try again." }, 503);
  }
}
