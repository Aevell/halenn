import "server-only";
import { createClient } from "@supabase/supabase-js";
import { url, key } from "../admin/lib/config";
import {
  CONSENT_COOKIE,
  parseConsent,
} from "../components/legal/consent-model";
import type { NextRequest } from "next/server";
export const intakeDatabase = () =>
  createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
export const analyticsAllowed = (r: NextRequest) =>
  parseConsent(r.cookies.get(CONSENT_COOKIE)?.value)?.optional === true;
export function sameOrigin(r: NextRequest) {
  // Next normalizes loopback URLs to localhost; Host retains the actual browser origin.
  const host = r.headers.get("host");
  if (!host || !r.headers.get("origin")) return false;
  try {
    return (
      r.headers.get("origin") ===
        new URL(`${r.nextUrl.protocol}//${host}`).origin &&
      !r.headers.get("user-agent")?.match(/bot|crawler|spider|headless/i)
    );
  } catch {
    return false;
  }
}
export async function limitedJson(r: Request, max: number) {
  if (Number(r.headers.get("content-length")) > max)
    throw Error("Request too large.");
  const reader = r.body?.getReader();
  if (!reader) throw Error("Empty request.");
  let bytes = 0,
    text = "";
  const decoder = new TextDecoder();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > max) {
      await reader.cancel();
      throw Error("Request too large.");
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text) as unknown;
}
export const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
