import type { Metadata } from "next";
import Cinematic from "./components/halenn/Cinematic";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function Home() {
  return <Cinematic contactEmail="contact@halenn.com" />;
}
