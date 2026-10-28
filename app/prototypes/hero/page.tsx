import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PrototypePicker from "./PrototypePicker";
import Cinematic from "./cinematic/Cinematic";
import Editorial from "./Editorial";
import Foundation from "./Foundation";

export const metadata: Metadata = {
  title: { absolute: "Halenn | Websites & Connected Systems" },
  icons: {
    icon: [
      { url: "/prototypes/halenn-ribbon-favicon.ico", sizes: "16x16 32x32 48x48 64x64", type: "image/x-icon" },
      { url: "/prototypes/halenn-ribbon-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/prototypes/halenn-ribbon-icon-64.png", sizes: "64x64", type: "image/png" },
    ],
    apple: { url: "/prototypes/halenn-ribbon-icon-180.png", sizes: "180x180", type: "image/png" },
  },
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
      {[<Cinematic key="cinematic" />, <Editorial key="editorial" />, <Foundation key="foundation" />]}
    </PrototypePicker>
  );
}
