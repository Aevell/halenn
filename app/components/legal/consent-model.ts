// A new optional service or purpose requires a new version and a fresh informed choice.
// Version 3 introduces optional first-party website and quiz analytics.
export const CONSENT_VERSION = 3 as const;
export const CONSENT_COOKIE = "halenn_privacy";
export const CONSENT_PATH = "/";
export const CONSENT_MAX_AGE = 180 * 24 * 60 * 60;
export type Consent = { version: typeof CONSENT_VERSION; optional: boolean; updatedAt: number };

export function parseConsent(raw: string | undefined, now = Date.now()): Consent | null {
  if (!raw || raw.length > 300) return null;
  try {
    const value = JSON.parse(decodeURIComponent(raw));
    if (!value || value.version !== CONSENT_VERSION || typeof value.optional !== "boolean" ||
      !Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0 || value.updatedAt > now ||
      now - value.updatedAt >= CONSENT_MAX_AGE * 1000) return null;
    return { version: CONSENT_VERSION, optional: value.optional, updatedAt: value.updatedAt };
  } catch { return null; }
}

export function consentCookie(choice: Consent, secure: boolean) {
  // Only these three fields are persisted; never form details or identifiers.
  const value = encodeURIComponent(JSON.stringify({ version: CONSENT_VERSION, optional: choice.optional, updatedAt: choice.updatedAt }));
  return `${CONSENT_COOKIE}=${value}; Path=${CONSENT_PATH}; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
}
