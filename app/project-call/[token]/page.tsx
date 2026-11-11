import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { intakeDatabase } from "../../lib/website-server";
import { googleProjectCallUrl, projectCallToken } from "../../lib/project-call-links";
import { callPortal } from "../../lib/online-call";
import ProjectCallPage from "../page";
import CallBooking from "../CallBooking";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your project call", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!projectCallToken(token)) return <ProjectCallPage />;
  let legacy: string | null = null;
  let portal = null;
  try {
    const db = await intakeDatabase();
    const state = await db.rpc("halenn_online_call_portal", { token });
    portal = !state.error ? callPortal(state.data) : null;
    // Keep the existing flow working until the calendar writer is activated.
    if (!portal && (!state.error || ["PGRST202", "42883"].includes(state.error.code))) {
      const destination = await db.rpc("halenn_project_call_destination", { token });
      if (!destination.error) legacy = googleProjectCallUrl(destination.data);
    }
  } catch { /* Saved enquiry and email follow-up remain available. */ }
  if (legacy) redirect(legacy);
  return portal ? <CallBooking token={token} initial={portal} asOf={new Date().toISOString()} /> : <ProjectCallPage />;
}
