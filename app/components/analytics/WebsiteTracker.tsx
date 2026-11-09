"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  flushWebsiteEvents,
  setWebsiteTrackingConsent,
  trackWebsiteEvent,
} from "../../lib/website-tracking";
export default function WebsiteTracker({ consent }: { consent: boolean }) {
  const path = usePathname();
  // Effect cleanup is not consent withdrawal (including StrictMode replay).
  useEffect(() => {
    setWebsiteTrackingConsent(consent);
  }, [consent]);
  useEffect(() => {
    if (consent) trackWebsiteEvent("page_view");
  }, [consent, path]);
  useEffect(() => {
    const flush = () => {
      void flushWebsiteEvents();
    };
    window.addEventListener("pagehide", flush);
    const hide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  return null;
}
