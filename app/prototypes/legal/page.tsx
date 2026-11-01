import { notFound } from "next/navigation";
import Cinematic from "../../components/halenn/cinematic/Cinematic";

export default function LegalPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Cinematic contactEmail="contact@halenn.com" />;
}
