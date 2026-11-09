import type { Metadata } from "next";
import "./workspace.css";
import "./(private)/analytics/analytics.css";
export const metadata: Metadata = {
  title: "Founder workspace",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="hw">{children}</div>;
}
