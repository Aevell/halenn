"use server";
import { revalidatePath } from "next/cache";
import { leadAccess } from "./lib/db";
import { cleanEntry, uuid, type Entry } from "./lib/analytics";

export async function recordActivity(input: Entry) {
  const { db } = await leadAccess();
  try {
    const values = cleanEntry(input);
    if (values.lead_id) {
      const { data: lead, error } = await db
        .from("halenn_leads")
        .select("id,channel,owner,created_at")
        .eq("id", values.lead_id)
        .single();
      if (error || !lead) return { error: "This lead is no longer available." };
      if (Date.parse(values.occurred_at) < Date.parse(lead.created_at))
        return { error: "Choose a time on or after this lead was added." };
      values.channel = lead.channel;
      // Activity owner is the person who performed it; default to the lead owner.
      if (!values.owner) values.owner = lead.owner;
    }
    const { error } = await db.from("halenn_activity").insert(values);
    if (error) {
      if (error.code !== "23505")
        return { error: "The activity could not be saved. Please try again." };
      const { data: saved } = await db
        .from("halenn_activity")
        .select(
          "id,lead_id,kind,occurred_at,amount_cents,currency,channel,owner,note,voided_at",
        )
        .eq("id", values.id)
        .maybeSingle();
      const same =
        saved &&
        !saved.voided_at &&
        Object.entries(values).every(([key, value]) =>
          key === "occurred_at"
            ? Date.parse(saved.occurred_at) === Date.parse(String(value))
            : saved[key as keyof typeof saved] === value,
        );
      if (!same)
        return {
          error:
            "This entry was already saved with different details. Close this form and check the activity log before adding another.",
        };
    }
    // A client-generated id makes a retry safe after a lost response.
    revalidatePath("/admin", "layout");
    return { id: values.id };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not save the activity.",
    };
  }
}
export async function voidActivity(id: string, reason: string) {
  const { db } = await leadAccess();
  if (
    !uuid.test(id) ||
    typeof reason !== "string" ||
    !reason.trim() ||
    reason.length > 300
  )
    return { error: "Add a short reason for this correction." };
  const { data, error } = await db
    .from("halenn_activity")
    .update({ voided_at: new Date().toISOString(), void_reason: reason.trim() })
    .eq("id", id)
    .is("voided_at", null)
    .not("kind", "in", "(stage,baseline)")
    .select("id")
    .maybeSingle();
  if (error || !data)
    return {
      error: "This record could not be corrected. Refresh and try again.",
    };
  revalidatePath("/admin", "layout");
  return { id };
}
