import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { nextWeek } from "../app/admin/lib/follow-up.ts";

test("next week keeps calendar dates across month, year, leap-day and DST boundaries", () => {
  for (const [from, to] of [["2026-12-28","2027-01-04"],["2028-02-25","2028-03-03"],["2026-03-25","2026-04-01"],["2026-10-23","2026-10-30"]])
    assert.equal(nextWeek(from), to);
});

function fixture({ status = "New", fail = false, allowed = true } = {}) {
  const row = { id: "lead", revision: 4, status, follow_up: null, company: "Studio", notes: "Co-founder’s notes", owner: "Davey" };
  const state = { revalidated: false, auth: 0, queries: 0 };
  const db = { from(table) {
    assert.equal(table, "halenn_leads"); state.queries++;
    let patch;
    const checks = [];
    return {
      update(value) { patch = value; return this; },
      eq(key, value) { checks.push(() => row[key] === value); return this; },
      neq(key, value) { checks.push(() => row[key] !== value); return this; },
      select() { return this; },
      async maybeSingle() {
        if (fail) return { error: { message: "Database unavailable" }, data: null };
        if (!checks.every(check => check())) return { error: null, data: null };
        Object.assign(row, patch);
        return { error: null, data: { id: row.id } };
      },
    };
  } };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL("../app/admin/lead-quick-actions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, require(name) {
    if (name === "next/cache") return { revalidatePath: () => { state.revalidated = true; } };
    if (name === "./lib/db") return { leadAccess: async () => { state.auth++; if (!allowed) throw new Error("Unauthorized"); return { db }; } };
    if (name === "./lib/leads") return { today: () => "2026-11-15" };
    if (name === "./lib/follow-up") return { nextWeek };
    throw new Error(name);
  } });
  return { action: exports.quickUpdateLead, row, state };
}

test("quick actions save only the intended field and preserve co-founder data", async () => {
  const { action, row, state } = fixture();
  assert.equal((await action("lead", 4, "contacted")).error, undefined);
  assert.equal(row.status, "Contacted");
  assert.equal(row.follow_up, null);
  assert.equal((await action("lead", 5, "next-week")).date, "2026-11-22");
  assert.equal(row.follow_up, "2026-11-22");
  assert.equal(row.status, "Contacted");
  assert.equal(row.notes, "Co-founder’s notes");
  assert.equal(row.owner, "Davey");
  assert.equal(row.revision, 6);
  assert(state.revalidated);
  assert.equal(state.auth, 2);
});

test("stale revisions, advanced stages and completed leads cannot be overwritten", async () => {
  for (const [status, revision, action] of [["New",3,"contacted"],["Qualified",4,"contacted"],["Won",4,"next-week"],["Closed",4,"next-week"]]) {
    const f = fixture({ status });
    assert((await f.action("lead", revision, action)).error);
    assert.equal(f.row.revision, 4);
    assert.equal(f.row.status, status);
    assert.equal(f.row.follow_up, null);
    assert.equal(f.state.revalidated, false);
  }
});

test("authorization, invalid actions and database failures never report success", async () => {
  const denied = fixture({ allowed: false });
  await assert.rejects(denied.action("lead", 4, "contacted"), /Unauthorized/);
  assert.equal(denied.state.queries, 0);
  const invalid = fixture();
  assert((await invalid.action("lead", 4, "delete")).error);
  assert.equal(invalid.state.queries, 0);
  const failed = fixture({ fail: true });
  assert((await failed.action("lead", 4, "next-week")).error);
  assert.equal(failed.row.revision, 4);
});
