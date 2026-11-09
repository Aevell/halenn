"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { database, founder, leadAccess, readLeads } from "./lib/db";
import { clean, duplicate, preview, type Fields } from "./lib/leads";
export async function signIn(_previous: string, form: FormData) {
  const db = await database();
  const result = await db.auth.signInWithPassword({
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("password") ?? ""),
  });
  if (result.error) return "Sign-in failed. Check your email and password.";
  const { data, error } = await db.rpc("halenn_is_founder");
  if (error || !data) {
    await db.auth.signOut({ scope: "local" });
    return "This account could not access the founder workspace.";
  }
  redirect("/admin");
}
export async function signOut() {
  const db = await database();
  await db.auth.signOut({ scope: "local" });
  redirect("/admin/sign-in");
}
export async function saveLead(
  input: Fields,
  record?: { id: string; revision: number },
) {
  const { db } = await leadAccess();
  try {
    const values = clean(input);
    const leads = await readLeads();
    if (leads.some((x) => x.id !== record?.id && duplicate(x, values)))
      return { error: "A lead with this company or website already exists." };
    const result = record
      ? await db
          .from("halenn_leads")
          .update({ ...values, revision: record.revision + 1 })
          .eq("id", record.id)
          .eq("revision", record.revision)
          .select("id")
          .maybeSingle()
      : await db.from("halenn_leads").insert(values).select("id").single();
    if (result.error)
      return {
        error:
          result.error.code === "23505"
            ? "This lead already exists."
            : "Could not save this lead. Try again.",
      };
    if (!result.data)
      return {
        error:
          "Another founder updated this lead. Reopen it to see their changes.",
      };
    revalidatePath("/admin", "layout");
    return { id: result.data.id as string };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save." };
  }
}
export async function importBatch(text: string) {
  const { db } = await leadAccess();
  if (typeof text !== "string" || text.length > 200000)
    return { error: "Paste a smaller batch." };
  const { rows, problem } = preview(text, await readLeads());
  if (problem) return { error: problem };
  if (rows.length > 200) return { error: "Import up to 200 rows at a time." };
  const ready = rows.filter((x) => x.label === "Ready").map((x) => x.fields);
  if (ready.length) {
    const { error } = await db.from("halenn_leads").insert(ready);
    if (error)
      return {
        error:
          error.code === "23505"
            ? "A company was just added by another founder. Retry to skip duplicates."
            : "The batch could not be saved. Your pasted rows are still here.",
      };
  }
  revalidatePath("/admin", "layout");
  return { count: ready.length, skipped: rows.length - ready.length };
}

export async function changePassword(_message: string, form: FormData) {
  const { db, user } = await founder();
  const password = String(form.get("password") ?? "");
  const current = String(form.get("current") ?? "");
  if (password.length < 12 || password.length > 128)
    return "Use a password between 12 and 128 characters.";
  if (password === current) return "Choose a different password.";
  const check = await db.auth.signInWithPassword({
    email: user.email!,
    password: current,
  });
  if (check.error) return "Your current password didn’t match.";
  const { error } = await db.auth.updateUser({
    password,
    current_password: current,
  });
  if (error) return "Password could not be changed. Try again.";
  redirect("/admin");
}

export async function changeNotificationRecipient(_message: string, form: FormData) {
  const { db } = await leadAccess();
  const value = form.get("recipient");
  const recipient = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!["aevellgroup@gmail.com", "contact@halenn.com"].includes(recipient))
    return "Choose one of Halenn’s notification addresses.";
  if (form.get("inboxReady") !== "yes")
    return "Confirm that this inbox can receive emails before saving.";
  const { error } = await db.rpc("halenn_set_enquiry_notification_recipient", { recipient });
  if (error) return "The notification address could not be saved. Please try again.";
  revalidatePath("/admin/account");
  return `Notification address saved: ${recipient}.`;
}
