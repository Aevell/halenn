import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PricingPage from "../../components/pricing/PricingPage";
import { parseBrowsingSelection } from "../../components/pricing/estimate-selection";

export const metadata: Metadata = {
  title: { absolute: "Pricing preview | Halenn" },
  robots: { index: false, follow: false },
};

export default async function PricingPrototype({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PricingPage initial={parseBrowsingSelection(await searchParams)} prototype />;
}
