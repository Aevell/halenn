import { readLeads } from "../../lib/db";
import { readActivity } from "../../lib/analytics-db";
import { today } from "../../lib/leads";
import Analytics from "./Analytics";
import "./analytics.css";

export const metadata = { title: "Analytics | Founder workspace" };
export default async function Page() {
  const [leads, activity] = await Promise.all([readLeads(), readActivity()]);
  return <Analytics leads={leads} activity={activity} now={today()} />;
}
