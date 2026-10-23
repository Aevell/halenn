import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PrototypePicker from "./PrototypePicker";
import Monument from "./Monument";
import Editorial from "./Editorial";
import Foundation from "./Foundation";

export const metadata: Metadata = {
  title: "Hero explorations",
  robots: { index: false, follow: false },
};

export default async function HeroExplorations({
  searchParams,
}: {
  searchParams: Promise<{ v?: string | string[] }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { v } = await searchParams;
  const initial = typeof v === "string" && /^[1-3]$/.test(v) ? Number(v) - 1 : 0;

  return (
    <PrototypePicker initial={initial}>
      {[<Monument key="monument" />, <Editorial key="editorial" />, <Foundation key="foundation" />]}
    </PrototypePicker>
  );
}
