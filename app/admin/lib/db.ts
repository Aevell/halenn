import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { url, key } from "./config";
import type { Lead } from "./leads";

export async function database() {
  const jar = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        try {
          for (const { name, value, options } of values)
            jar.set(name, value, options);
        } catch {
          /* Proxy persists refreshes for server components. */
        }
      },
    },
  });
}
export const founder = cache(async () => {
  const db = await database();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/admin/sign-in");
  const { data: allowed, error } = await db.rpc("halenn_is_founder");
  if (error) throw new Error("Founder access could not be checked.");
  if (!allowed) redirect("/admin/sign-in?access=denied");
  return { db, user };
});
export const passwordRequired = cache(async () => {
  const { db } = await founder();
  const { data, error } = await db.rpc("halenn_needs_password");
  if (error) throw new Error("Password status could not be checked.");
  return data === true;
});
export const leadAccess = cache(async () => {
  const account = await founder();
  if (await passwordRequired()) redirect("/admin/account");
  return account;
});
export async function readLeads(): Promise<Lead[]> {
  const { db } = await leadAccess();
  const rows: Lead[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await db
      .from("halenn_leads")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id")
      .range(start, start + 499);
    if (error) throw new Error("Leads could not be loaded.");
    rows.push(...(data as Lead[]));
    if (data.length < 500) return rows;
  }
}
