"use client";

import { useEffect, useRef } from "react";
import { ActionArrow } from "../halenn/cinematic/Action";
import controls from "../halenn/cinematic/controls.module.css";
import s from "./enquiry-success.module.css";

export default function EnquirySuccess({
  bookingUrl,
  headingId,
  onDone,
}: {
  bookingUrl: string | null;
  headingId: string;
  onDone: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <div className={s.success}>
      <p className={s.eyebrow}>Enquiry received</p>
      <h2 id={headingId} ref={heading} tabIndex={-1} className={s.heading}>
        Your enquiry is with us.
      </h2>
      <p role="status" className={s.receipt}>
        Thank you. We’ll review your enquiry and reply by email with the next
        steps.
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
            <span>Book a 30-minute call</span>
            <ActionArrow />
          </a>
          <p className={s.bookingHint}>
            Choose a time on our Google booking page. Use the same email address
            as your enquiry.
          </p>
        </div>
      )}

      <div className={s.actions}>
        <button type="button" className={s.done} onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
