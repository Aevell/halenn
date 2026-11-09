"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import Wordmark from "../components/halenn/cinematic/Wordmark";
import { usePathname } from "next/navigation";
import { signOut } from "./actions";
export default function Header({ email }: { email?: string }) {
  const path = usePathname();
  const account = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (
        account.current?.open &&
        !account.current.contains(event.target as Node)
      )
        account.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <header className="hw-bar">
      <div className="hw-bar-inner">
        <Link
          className="hw-brand"
          href={email ? "/admin" : "/"}
          aria-label="Halenn home"
        >
          <Wordmark />
        </Link>
        {email && (
          <>
            <nav aria-label="Founder navigation">
              {[
                ["/admin", "Overview"],
                ["/admin/leads", "Leads"],
                ["/admin/analytics", "Analytics"],
              ].map(([href, label]) => (
                <Link
                  aria-current={path === href ? "page" : undefined}
                  href={href}
                  key={href}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <details
              className="hw-account"
              ref={account}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node))
                  e.currentTarget.open = false;
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape" && account.current?.open) {
                  account.current.open = false;
                  account.current.querySelector("summary")?.focus();
                }
              }}
            >
              <summary aria-label="Founder account">
                {email[0].toUpperCase()}
              </summary>
              <div>
                <span>{email}</span>
                <Link
                  href="/admin/account"
                  onClick={() => {
                    if (account.current) account.current.open = false;
                  }}
                >
                  Account settings
                </Link>
                <form action={signOut}>
                  <button>Sign out</button>
                </form>
              </div>
            </details>
          </>
        )}
      </div>
    </header>
  );
}
