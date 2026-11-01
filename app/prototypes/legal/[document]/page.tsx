import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LegalDocument from "../../../components/legal/LegalDocument";
import { legalDocuments } from "../../../components/legal/documents";

type Props = { params: Promise<{ document: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = (await params).document;
  const document = Object.hasOwn(legalDocuments, slug) ? legalDocuments[slug] : undefined;
  return { title: { absolute: `${document?.title ?? "Legal preview"} | Halenn` }, robots: { index: false, follow: false } };
}
export default async function LegalDraft({ params }: Props) {
  if (process.env.NODE_ENV !== "development") notFound();
  const slug = (await params).document;
  if (!Object.hasOwn(legalDocuments, slug)) notFound();
  return <LegalDocument document={legalDocuments[slug]} slug={slug} />;
}
