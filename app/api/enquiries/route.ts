import { NextResponse, type NextRequest } from "next/server";
import {
  analyticsAllowed,
  intakeDatabase,
  limitedJson,
  privateHeaders,
  sameOrigin,
} from "../../lib/website-server";
import { cleanEnquiry } from "../../lib/website-model";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "Please send your enquiry from the website form." },
      { status: 403, headers: privateHeaders },
    );
  try {
    const raw = await limitedJson(request, 100000);
    if (raw && typeof raw === "object" && "website" in raw && raw.website)
      return NextResponse.json({ ok: true }, { headers: privateHeaders });
    const payload = cleanEnquiry(raw);
    if (!analyticsAllowed(request)) payload.tracking = null;
    const { data, error } = await intakeDatabase().rpc(
      "halenn_submit_website_enquiry",
      { payload },
    );
    if (error)
      return NextResponse.json(
        {
          error:
            "Your enquiry could not be saved. Please try again, or email contact@halenn.com.",
        },
        { status: 503, headers: privateHeaders },
      );
    if (data === "limited")
      return NextResponse.json(
        {
          error:
            "A few enquiries have already been received. Please try again later, or email contact@halenn.com.",
        },
        { status: 429, headers: privateHeaders },
      );
    if (data === "conflict")
      return NextResponse.json(
        {
          error:
            "This enquiry was already received with different details. Close and reopen the form to send a new enquiry.",
        },
        { status: 409, headers: privateHeaders },
      );
    if (data !== "received") throw Error("Unexpected response.");
    return NextResponse.json({ ok: true }, { headers: privateHeaders });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error && e.message.startsWith("Please")
            ? e.message
            : "Please check your enquiry and try again.",
      },
      { status: 400, headers: privateHeaders },
    );
  }
}
