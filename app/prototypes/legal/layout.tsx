import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: { absolute: "Legal design preview | Halenn" }, robots: { index: false, follow: false } };
export default function LegalPreviewLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== "development") notFound();
  return children;
}
