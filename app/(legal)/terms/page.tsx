import type { Metadata } from "next";
import LegalDocument from "../../components/legal/LegalDocument";
import { legalDocuments } from "../../components/legal/documents";

export const metadata: Metadata = { title: "Terms & conditions", description: legalDocuments.terms.description, alternates: { canonical: "/terms" }, openGraph: { title: "Terms & conditions | Halenn", description: legalDocuments.terms.description, url: "/terms" } };
export default function Page() { return <LegalDocument document={legalDocuments.terms} slug="terms" />; }
