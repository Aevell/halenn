import { readLeads } from "../../lib/db";
import { today } from "../../lib/leads";
import Leads from "./Leads";
export default async function Page() {
  return <Leads leads={await readLeads()} now={today()} />;
}
