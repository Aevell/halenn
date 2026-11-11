import { NextResponse, type NextRequest } from "next/server";
import { intakeDatabase, privateHeaders } from "../../lib/website-server";
import { googleProjectCallUrl, projectCallToken } from "../../lib/project-call-links";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  let destination: string | null = null;
  if (projectCallToken(token)) {
    try {
      const { data, error } = await (await intakeDatabase()).rpc(
        "halenn_project_call_destination", { token },
      );
      if (!error) destination = googleProjectCallUrl(data);
    } catch {
      // Email remains available when the optional calendar is unavailable.
    }
  }
  return NextResponse.redirect(destination ?? new URL("/project-call", request.url), {
    status: 303,
    headers: {
      ...privateHeaders,
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
