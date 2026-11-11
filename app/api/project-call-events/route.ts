import { NextResponse } from "next/server";
import { intakeDatabase, privateHeaders } from "../../lib/website-server";

const maximumBytes = 100_000;
const reply = (value: object, status: number) =>
  NextResponse.json(value, { status, headers: privateHeaders });

export async function POST(request: Request) {
  const signature = request.headers.get("x-halenn-signature") ?? "";
  const sentAt = request.headers.get("x-halenn-timestamp") ?? "";
  if (!/^[a-f0-9]{64}$/.test(signature) || !/^\d{10}$/.test(sentAt))
    return reply({ error: "Unauthorised delivery." }, 401);
  if (Math.abs(Date.now() / 1000 - Number(sentAt)) > 300)
    return reply({ error: "Expired delivery." }, 401);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return reply({ error: "JSON required." }, 415);
  if (Number(request.headers.get("content-length")) > maximumBytes)
    return reply({ error: "Delivery too large." }, 413);

  let rawBody = "";
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "Empty delivery." }, 400);
    // Verify the exact UTF-8 body, without parsing or re-serializing the JSON.
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel();
        return reply({ error: "Delivery too large." }, 413);
      }
      rawBody += decoder.decode(chunk.value, { stream: true });
    }
    rawBody += decoder.decode();
  } catch {
    return reply({ error: "Invalid delivery." }, 400);
  }

  try {
    const { data, error } = await (await intakeDatabase()).rpc(
      "halenn_receive_project_call_events",
      { raw_body: rawBody, signature, sent_at: sentAt },
    );
    if (error) {
      if (error.code === "28000") return reply({ error: "Unauthorised delivery." }, 401);
      if (error.code === "22023") return reply({ error: "Invalid delivery." }, 400);
      return reply({ error: "Booking sync unavailable." }, 503);
    }
    if (data?.accepted !== true) return reply({ error: "Delivery not accepted." }, 503);
    return reply({ accepted: true }, 200);
  } catch {
    return reply({ error: "Booking sync unavailable." }, 503);
  }
}
