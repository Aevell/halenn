import type { Metadata } from "next";
import LegalDocument from "../../components/legal/LegalDocument";
import { legalDocuments } from "../../components/legal/documents";

export const metadata: Metadata = { title: "Cookie information", description: legalDocuments.cookies.description, alternates: { canonical: "/cookies" }, openGraph: { title: "Cookie information | Halenn", description: legalDocuments.cookies.description, url: "/cookies" } };
export default function Page() { return <LegalDocument document={legalDocuments.cookies} slug="cookies" />; }
