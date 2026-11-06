"use client";
import { useActionState } from "react";
import { signIn } from "../actions";
export default function Login() {
  const [error, action, pending] = useActionState(signIn, "");
  return (
    <form action={action} className="hw-form">
      <label>
        Email
        <input
          type="email"
          name="email"
          autoComplete="username"
          placeholder="you@halenn.com"
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="hw-primary" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
