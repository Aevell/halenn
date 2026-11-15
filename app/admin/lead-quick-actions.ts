"use server";

import { revalidatePath } from "next/cache";
import { leadAccess } from "./lib/db";
import { today } from "./lib/leads";
import { nextWeek } from "./lib/follow-up";

export async function quickUpdateLead(
  id: string,
  revision: number,
  action: "contacted" | "next-week",
) {
  const { db } = await leadAccess();
  if (typeof id !== "string" || !id || !Number.isSafeInteger(revision) || revision < 0 ||
      (action !== "contacted" && action !== "next-week"))
    return { error: "Could not update this lead. Refresh and try again." };
  const date = nextWeek(today());
  try {
    let query = db.from("halenn_leads")
      .update({
        ...(action === "contacted" ? { status: "Contacted" } : { follow_up: date }),
        revision: revision + 1,
      })
      .eq("id", id)
      .eq("revision", revision);
    // Never move an advanced lead backwards or schedule a completed lead.
    query = action === "contacted"
      ? query.eq("status", "New")
      : query.neq("status", "Won").neq("status", "Closed");
    const { data, error } = await query.select("id").maybeSingle();
    if (error) return { error: "Could not save. Please try again." };
    if (!data) return { error: "This lead has changed. Refresh the list before trying again." };
    revalidatePath("/admin", "layout");
    return { date };
  } catch {
    return { error: "Could not save. Please try again." };
  }
}
