"use client";

import { useCallback, useRef, useState } from "react";
import {
  flushWebsiteEvents,
  trackWebsiteEvent,
  trackingContext,
} from "./website-tracking";

type Origin = "homepage" | "quiz" | "pricing";
type EnquiryFields = {
  name: string;
  email: string;
  company?: string;
  message: string;
  website: string;
};
type FormSession = {
  id: string;
  form_id: string;
  origin: Origin;
  started: boolean;
  received: boolean;
};

export const enquiryReceivedMessage =
  "Thank you. Your enquiry has been received. We’ll be in touch.";

// One request ID survives retries, including a lost response after the server saved it.
// Analytics receives event metadata only. Contact details go solely to /api/enquiries.
export function useEnquirySubmission(enabled = true) {
  const session = useRef<FormSession | null>(null);
  const sending = useRef(false);
  const opened = useRef(false);
  const invalidAt = useRef(0);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);

  const details = useCallback(() => {
    const current = session.current;
    return current
      ? {
          form_id: current.form_id,
          origin: current.origin,
          quiz_id: trackingContext()?.quiz_id,
        }
      : undefined;
  }, []);

  const open = useCallback(
    (origin: Origin, reset = false) => {
      if (!enabled || sending.current) return false;
      if (opened.current && !reset) return false;
      const fresh =
        !session.current ||
        session.current.received ||
        reset ||
        session.current.origin !== origin;
      if (fresh) {
        session.current = {
          id: crypto.randomUUID(),
          form_id: crypto.randomUUID(),
          origin,
          started: false,
          received: false,
        };
        setSent(false);
        setError("");
        setConflict(false);
        invalidAt.current = 0;
      }
      opened.current = true;
      trackWebsiteEvent("enquiry_open", details());
      return fresh;
    },
    [enabled, details],
  );

  const firstInput = useCallback(() => {
    const current = session.current;
    if (!enabled || !current || current.started || current.received) return;
    current.started = true;
    trackWebsiteEvent("enquiry_start", details());
  }, [enabled, details]);

  const invalid = useCallback(() => {
    if (
      !enabled ||
      !session.current ||
      sending.current ||
      session.current.received
    )
      return;
    setError(
      "Please check the required fields and enter a valid email address.",
    );
    // Native validation emits one invalid event per field; count the attempt once.
    if (Date.now() - invalidAt.current < 500) return;
    invalidAt.current = Date.now();
    trackWebsiteEvent("enquiry_attempt", details());
    trackWebsiteEvent("enquiry_error", { ...details(), code: "validation" });
  }, [enabled, details]);

  const restart = useCallback(() => {
    if (session.current) open(session.current.origin, true);
  }, [open]);

  const close = useCallback(() => {
    if (!enabled || !session.current || !opened.current) return;
    opened.current = false;
    trackWebsiteEvent("enquiry_close", details());
  }, [enabled, details]);

  const submit = useCallback(
    async (fields: EnquiryFields) => {
      const current = session.current;
      if (!enabled || !current || sending.current || current.received) return;
      sending.current = true;
      setPending(true);
      setError("");
      trackWebsiteEvent("enquiry_attempt", details());
      try {
        // Flush consented milestones before the server confirms the enquiry.
        await flushWebsiteEvents();
        const response = await fetch("/api/enquiries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...fields,
            id: current.id,
            form_id: current.form_id,
            origin: current.origin,
            tracking: trackingContext(),
          }),
          signal: AbortSignal.timeout(25000),
        });
        const result: unknown = await response.json().catch(() => null);
        if (
          !response.ok ||
          !result ||
          typeof result !== "object" ||
          !("ok" in result) ||
          result.ok !== true
        ) {
          const message =
            response.status === 429
              ? "Too many attempts right now. Please wait a little before trying again, or email us directly."
              : result &&
                  typeof result === "object" &&
                  "error" in result &&
                  typeof result.error === "string" &&
                  result.error.length <= 300
                ? result.error
                : "Your enquiry could not be received. Your details are still here; please try again or email us directly.";
          setError(message);
          setConflict(response.status === 409);
          trackWebsiteEvent("enquiry_error", {
            ...details(),
            code: response.status === 400 ? "validation" : "server",
          });
          return;
        }
        current.received = true;
        setSent(true);
        // The server records enquiry_received only after persistence succeeds.
      } catch {
        setError(
          "We couldn’t confirm receipt. Your details are still here. Retry safely, or email us directly.",
        );
        trackWebsiteEvent("enquiry_error", { ...details(), code: "network" });
      } finally {
        sending.current = false;
        setPending(false);
      }
    },
    [enabled, details],
  );

  return {
    open,
    close,
    restart,
    firstInput,
    invalid,
    submit,
    pending,
    sent,
    error,
    conflict,
  };
}
