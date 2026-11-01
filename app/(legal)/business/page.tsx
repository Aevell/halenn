import type { Metadata } from "next";
import LegalDocument from "../../components/legal/LegalDocument";
import { legalDocuments } from "../../components/legal/documents";

export const metadata: Metadata = { title: "Business details", description: legalDocuments.business.description, alternates: { canonical: "/business" }, openGraph: { title: "Business details | Halenn", description: legalDocuments.business.description, url: "/business" } };
export default function Page() { return <LegalDocument document={legalDocuments.business} slug="business" />; }
