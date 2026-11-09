"use client";

import { useActionState } from "react";
import { changeNotificationRecipient } from "../../actions";

export default function NotificationRecipient({ recipient }: { recipient: string }) {
  const [message, action, pending] = useActionState(changeNotificationRecipient, "");
  return (
    <form className="hw-form hw-notification-settings" action={action}>
      <label htmlFor="notification-recipient">
        Send notifications to
        <select key={recipient} id="notification-recipient" name="recipient" defaultValue={recipient} disabled={pending}>
          <option value="aevellgroup@gmail.com">aevellgroup@gmail.com</option>
          <option value="contact@halenn.com">contact@halenn.com</option>
        </select>
      </label>
      <label className="hw-notification-confirm">
        <input type="checkbox" name="inboxReady" value="yes" required disabled={pending} />
        <span>I can receive emails at this address.</span>
      </label>
      <p className="hw-notification-note">Change to contact@halenn.com once its mailbox is ready. Emails already submitted for sending keep their original address.</p>
      <button className="hw-primary" disabled={pending}>{pending ? "Saving…" : "Save notification address"}</button>
      <p role="status">{message}</p>
    </form>
  );
}
