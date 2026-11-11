import { NextResponse } from "next/server";
import { intakeDatabase, privateHeaders } from "../../lib/website-server";

export async function POST(request: Request) {
  const signature = request.headers.get("x-halenn-signature") ?? "";
  const sentAt = request.headers.get("x-halenn-timestamp") ?? "";
  const reply = (accepted: boolean, status: number) => NextResponse.json({ accepted }, { status, headers: privateHeaders });
  if (!/^[a-f0-9]{64}$/.test(signature) || !/^\d{10}$/.test(sentAt) || Math.abs(Date.now() / 1000 - Number(sentAt)) > 300) return reply(false, 401);
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply(false, 400);
    let raw = "", length = 0;
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 30_000) { await reader.cancel(); return reply(false, 413); }
      raw += decoder.decode(part.value, { stream: true });
    }
    raw += decoder.decode();
    const { data, error } = await (await intakeDatabase()).rpc("halenn_finish_online_call", { raw_body: raw, signature, sent_at: sentAt });
    return !error && data?.accepted === true ? reply(true, 200) : reply(false, error?.code === "28000" ? 401 : 503);
  } catch { return reply(false, 503); }
}
