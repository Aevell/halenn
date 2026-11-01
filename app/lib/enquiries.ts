import { createHash } from "node:crypto";

type Environment = { RESEND_API_KEY?: string; ENQUIRY_FROM_EMAIL?: string };
type Fetch = typeof fetch;
type Enquiry = { name: string; email: string; message: string; context: string; requestId: string };
const emailPattern = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const recipient = "contact@halenn.com";
const maxBytes = 30_000;

function reply(status: number, error?: string) {
  return Response.json(error ? { error } : { ok: true }, {
    status, headers: { "Cache-Control": "no-store" },
  });
}

function validate(value: unknown): Enquiry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (!["name", "email", "message", "context", "requestId", "website"].every(key => typeof data[key] === "string")) return null;
  const name = (data.name as string).trim();
  const email = (data.email as string).trim();
  const message = (data.message as string).trim();
  const context = (data.context as string).trim();
  const requestId = data.requestId as string;
  if (name.length < 1 || name.length > 100 || /[\r\n\0]/.test(name)) return null;
  if (email.length > 254 || !emailPattern.test(email)) return null;
  if (message.length < 10 || message.length > 3000 || context.length > 18000) return null;
  if (!uuidPattern.test(requestId) || (data.website as string).trim()) return null;
  if (/\0/.test(message + context)) return null;
  return { name, email, message, context, requestId };
}

// This is an extra per-instance guard, not a substitute for Vercel Firewall limits.
// Only short-lived hashes are stored; enquiry contents and IP addresses are not logged.
export function createAttemptLimiter() {
  const attempts = new Map<string, { count: number; reset: number }>();
  return (key: string, now: number) => {
    for (const [id, entry] of attempts) if (entry.reset <= now) attempts.delete(id);
    const entry = attempts.get(key);
    if (!entry && attempts.size >= 5000) return false;
    if (entry && entry.count >= 5) return false;
    attempts.set(key, { count: (entry?.count ?? 0) + 1, reset: entry?.reset ?? now + 600_000 });
    return true;
  };
}
const allowAttempt = createAttemptLimiter();

export async function handleEnquiry(
  request: Request,
  environment: Environment,
  send: Fetch = fetch,
  allow = allowAttempt,
) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return reply(403, "Please send your enquiry using the form on this website.");
  }
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return reply(415, "Please send your enquiry using the form on this website.");
  }
  if (Number(request.headers.get("content-length")) > maxBytes) return reply(413, "Please shorten your enquiry and try again.");
  // Bound the stream as well as Content-Length, which an arbitrary caller can omit.
  let value: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply(400, "Please check your details and try again.");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      bytes += chunk.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); return reply(413, "Please shorten your enquiry and try again."); }
      chunks.push(chunk);
    }
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return reply(400, "Please check your details and try again."); }
  const enquiry = validate(value);
  if (!enquiry) return reply(400, "Please check your name, email and message, then try again.");
  const key = environment.RESEND_API_KEY?.trim();
  const from = environment.ENQUIRY_FROM_EMAIL?.trim();
  if (!key || !from || !emailPattern.test(from)) {
    return reply(503, "Enquiries are temporarily unavailable. Please try again later.");
  }
  const address = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const fingerprint = createHash("sha256").update(address).digest("hex");
  if (!allow(fingerprint, Date.now())) return reply(429, "You’ve made several attempts. Please wait a few minutes before trying again.");
  try {
    const result = await send("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `halenn-enquiry/${enquiry.requestId}`,
      },
      body: JSON.stringify({
        from: `Halenn website <${from}>`,
        to: [recipient],
        reply_to: enquiry.email,
        subject: "New website enquiry for Halenn",
        text: [
          "NEW HALENN WEBSITE ENQUIRY", "", `Name: ${enquiry.name}`, `Email: ${enquiry.email}`, "",
          enquiry.message, "", "PROJECT DETAILS SUPPLIED WITH THE ENQUIRY", enquiry.context || "General enquiry",
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (result.ok) {
      const accepted = await result.json() as { id?: unknown };
      if (typeof accepted.id === "string" && accepted.id) return reply(200);
    }
  } catch { /* Keep provider errors and personal information out of the response. */ }
  return reply(502, "We couldn’t send your enquiry. Your details are still here. Please try again.");
}
