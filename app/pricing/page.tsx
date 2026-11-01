import type { Metadata } from "next";
import PricingPage from "../components/pricing/PricingPage";
import { parseBrowsingSelection } from "../components/pricing/estimate-selection";
import { parseGuideAnswers } from "../components/halenn/solution-guide";

const title = "Pricing for Web, App & AI Automation | Halenn";
const description = "Find your starting price for a website, webshop, native app or AI automation. Build your estimate, explore clear scopes and optional care, and discuss your project with Halenn.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/pricing" },
  robots: { index: true, follow: true },
  openGraph: {
    title, description, url: "https://halenn.com/pricing", siteName: "Halenn", type: "website",
    images: [{ url: "/brand/halenn-ribbon-v1.png", width: 1536, height: 1024, alt: "Halenn silver ribbon logo" }],
  },
};

export default async function PublicPricing({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const guideAnswers = parseGuideAnswers(typeof query.guide === "string" ? query.guide : undefined);
  return <PricingPage initial={parseBrowsingSelection(query)} guideAnswers={guideAnswers} />;
}
