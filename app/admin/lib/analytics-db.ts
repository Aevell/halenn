import "server-only";
import { leadAccess } from "./db";
import type { Activity } from "./analytics";

export async function readActivity(): Promise<Activity[]> {
  const { db } = await leadAccess();
  const rows: Activity[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await db
      .from("halenn_activity")
      .select(
        "id,lead_id,kind,occurred_at,created_at,from_stage,to_stage,amount_cents,currency,channel,owner,note,voided_at,void_reason",
      )
      .order("occurred_at", { ascending: false })
      .order("id")
      .range(start, start + 499);
    if (error)
      throw new Error(
        "Analytics records could not be loaded. Please try again.",
      );
    rows.push(...(data as Activity[]));
    if (data.length < 500) return rows;
  }
}
