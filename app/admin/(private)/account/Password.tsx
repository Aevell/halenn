"use client";
import { useActionState } from "react";
import { changePassword } from "../../actions";
export default function Password() {
  const [message, action, pending] = useActionState(changePassword, "");
  return (
    <form className="hw-form" action={action}>
      <label>
        Current password
        <input
          name="current"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <label>
        New password
        <input
          name="password"
          type="password"
          minLength={12}
          autoComplete="new-password"
          required
        />
      </label>
      <button className="hw-primary" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
