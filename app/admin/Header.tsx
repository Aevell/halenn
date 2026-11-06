"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "./actions";
export default function Header({ email }: { email?: string }) {
  const path = usePathname();
  return (
    <header className="hw-bar">
      <div className="hw-bar-inner">
        <Link
          className="hw-brand"
          href={email ? "/admin" : "/"}
          aria-label="Halenn home"
        >
          <Image
            src="/brand/halenn-mark-v2-64.png"
            alt=""
            width={32}
            height={32}
          />
          Halenn
        </Link>
        {email && (
          <>
            <nav aria-label="Founder navigation">
              {[
                ["/admin", "Overview"],
                ["/admin/leads", "Leads"],
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
            <details className="hw-account">
              <summary aria-label="Founder account">
                {email[0].toUpperCase()}
              </summary>
              <div>
                <span>{email}</span>
                <Link href="/admin/account">Account settings</Link>
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
