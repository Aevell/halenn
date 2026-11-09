import { NextResponse, type NextRequest } from "next/server";
import {
  analyticsAllowed,
  intakeDatabase,
  limitedJson,
  privateHeaders,
  sameOrigin,
} from "../../lib/website-server";
import { cleanWebsiteBatch } from "../../lib/website-model";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request) || !analyticsAllowed(request))
    return new NextResponse(null, { status: 204, headers: privateHeaders });
  try {
    const payload = cleanWebsiteBatch(await limitedJson(request, 20000));
    const { data, error } = await intakeDatabase().rpc(
      "halenn_record_website_events",
      { payload },
    );
    if (error)
      return NextResponse.json(
        { error: "Tracking is temporarily unavailable." },
        { status: 503, headers: privateHeaders },
      );
    return new NextResponse(null, {
      status: data ? 204 : 429,
      headers: privateHeaders,
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid tracking request." },
      { status: 400, headers: privateHeaders },
    );
  }
}
