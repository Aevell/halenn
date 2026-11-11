"use client";

import { useEffect, useRef } from "react";
import { ActionArrow } from "../halenn/cinematic/Action";
import controls from "../halenn/cinematic/controls.module.css";
import s from "./enquiry-success.module.css";

export default function EnquirySuccess({
  bookingUrl,
  headingId,
  onContinueByEmail,
}: {
  bookingUrl: string | null;
  headingId: string;
  onContinueByEmail: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <div className={s.success}>
      <p className={s.eyebrow}>Enquiry received</p>
      <h2 id={headingId} ref={heading} tabIndex={-1} className={s.heading}>
        {bookingUrl ? "Let’s discuss your project." : "Your enquiry is with us."}
      </h2>
      <p role="status" className={s.receipt}>
        Thank you. Your enquiry has been received.
      </p>

      {bookingUrl && (
        <div className={s.offer}>
          <p className={s.duration}>Optional · 30 minutes</p>
          <p className={s.description}>
            A conversation about your business, what you’d like to achieve and
            how Halenn could help.
          </p>
          <a
            href={bookingUrl}
            className={`${controls.action} ${controls.plainArrow} ${s.bookingAction}`}
          >
            <span>Book a project call</span>
            <ActionArrow />
          </a>
        </div>
      )}

      <div className={s.emailOption}>
        <p>
          {bookingUrl
            ? "Prefer email? We’ll follow up on your enquiry."
            : "We’ll review your enquiry and follow up by email about the next steps."}
        </p>
        <button
          type="button"
          className={s.continue}
          onClick={onContinueByEmail}
        >
          Continue by email
        </button>
      </div>
    </div>
  );
}
