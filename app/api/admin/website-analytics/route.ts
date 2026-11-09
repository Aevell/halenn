import { NextResponse, type NextRequest } from "next/server";
import { database } from "../../../admin/lib/db";
import { validDate } from "../../../admin/lib/analytics";
import { privateHeaders } from "../../../lib/website-server";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const db = await database();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401, headers: privateHeaders },
    );
  const p = request.nextUrl.searchParams,
    from = p.get("from") || "",
    to = p.get("to") || "",
    source = p.get("source") || "",
    device = p.get("device") || "";
  if (
    !validDate(from) ||
    !validDate(to) ||
    from > to ||
    source.length > 64 ||
    !["", "desktop", "tablet", "mobile"].includes(device)
  )
    return NextResponse.json(
      { error: "Choose valid report filters." },
      { status: 400, headers: privateHeaders },
    );
  const { data, error } = await db.rpc("halenn_website_report", {
    p_from: from,
    p_to: to,
    p_source: source,
    p_device: device,
  });
  if (error)
    return NextResponse.json(
      {
        error:
          error.code === "42501"
            ? "Founder access is required."
            : "Website reporting is temporarily unavailable.",
      },
      { status: error.code === "42501" ? 403 : 503, headers: privateHeaders },
    );
  return NextResponse.json(data, { headers: privateHeaders });
}
