import { NextResponse, type NextRequest } from "next/server";
import {
  analyticsAllowed,
  intakeDatabase,
  limitedJson,
  privateHeaders,
  sameOrigin,
} from "../../lib/website-server";
import { cleanEnquiry } from "../../lib/website-model";
import { projectCallPath } from "../../lib/project-call-links";

const saveUnavailable = () => NextResponse.json(
  { error: "We couldn’t confirm receipt of your enquiry. Please try again, or email contact@halenn.com." },
  { status: 503, headers: privateHeaders },
);

export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "Please send your enquiry from the website form." },
      { status: 403, headers: privateHeaders },
    );
  let payload: ReturnType<typeof cleanEnquiry>;
  try {
    const raw = await limitedJson(request, 100000);
    if (raw && typeof raw === "object" && "website" in raw && raw.website)
      return NextResponse.json({ ok: true }, { headers: privateHeaders });
    payload = cleanEnquiry(raw);
    if (!analyticsAllowed(request)) payload.tracking = null;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message.startsWith("Please")
            ? error.message
            : "Please check your enquiry and try again.",
      },
      { status: 400, headers: privateHeaders },
    );
  }
  try {
    const db = await intakeDatabase();
    let { data, error } = await db.rpc(
      "halenn_submit_website_enquiry_with_booking",
      { payload },
    );
    // Keep intake available while the optional booking migration is rolled out.
    // Never retry a failed or timed-out write through a different endpoint.
    if (error && ["PGRST202", "42883"].includes(error.code)) {
      ({ data, error } = await db.rpc("halenn_submit_website_enquiry", { payload }));
    }
    if (error) return saveUnavailable();
    const outcome = typeof data === "string" ? data : data?.result;
    if (outcome === "limited")
      return NextResponse.json(
        {
          error:
            "A few enquiries have already been received. Please try again later, or email contact@halenn.com.",
        },
        { status: 429, headers: privateHeaders },
      );
    if (outcome === "conflict")
      return NextResponse.json(
        {
          error:
            "This enquiry was already received with different details. Close and reopen the form to send a new enquiry.",
        },
        { status: 409, headers: privateHeaders },
      );
    if (outcome !== "received") return saveUnavailable();
    return NextResponse.json(
      { ok: true, bookingUrl: projectCallPath(data?.bookingUrl) },
      { headers: privateHeaders },
    );
  } catch {
    // A transport failure may happen after persistence. Keep the request ID for
    // a safe retry, without claiming the visitor entered invalid details.
    return saveUnavailable();
  }
}
