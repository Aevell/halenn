import type { Metadata } from "next";
import LegalDocument from "../../components/legal/LegalDocument";
import { legalDocuments } from "../../components/legal/documents";

export const metadata: Metadata = { title: "Privacy policy", description: legalDocuments.privacy.description, alternates: { canonical: "/privacy" }, openGraph: { title: "Privacy policy | Halenn", description: legalDocuments.privacy.description, url: "/privacy" } };
export default function Page() { return <LegalDocument document={legalDocuments.privacy} slug="privacy" />; }
