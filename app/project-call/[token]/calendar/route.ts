import { NextResponse } from "next/server";
import { intakeDatabase, privateHeaders } from "../../../lib/website-server";
import { projectCallToken } from "../../../lib/project-call-links";
import { callCalendar, callPortal } from "../../../lib/online-call";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (projectCallToken(token)) {
    try {
      const { data, error } = await (await intakeDatabase()).rpc("halenn_online_call_portal", { token });
      const p = !error && callPortal(data);
      if (p && p.status === "confirmed" && p.startsAt && p.meetUrl) return new NextResponse(callCalendar(p.startsAt, p.meetUrl, token), {
        headers: { ...privateHeaders, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="halenn-project-call.ics"', "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" },
      });
    } catch { /* No calendar entry is generated for an unverified booking. */ }
  }
  return new NextResponse("This appointment is not available.", { status: 404, headers: privateHeaders });
}
