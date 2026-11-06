export const statuses = ["New", "Contacted", "Won", "Closed"] as const;
export type Status = (typeof statuses)[number];
export type Fields = {
  company: string;
  website: string;
  opportunity: string;
  contact: string;
  source: string;
  notes: string;
  status: Status;
  follow_up: string | null;
};
export type Lead = Fields & {
  id: string;
  revision: number;
  created_at: string;
};
export const empty: Fields = {
  company: "",
  website: "",
  opportunity: "",
  contact: "",
  source: "",
  notes: "",
  status: "New",
  follow_up: null,
};
export const columns = [
  "Company",
  "Website",
  "Opportunity",
  "Contact",
  "Source URL",
  "Notes",
];
export function today() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Amsterdam",
  }).format(new Date());
}
export function due(lead: Fields, date: string) {
  return (
    lead.status !== "Won" &&
    lead.status !== "Closed" &&
    !!lead.follow_up &&
    lead.follow_up <= date
  );
}
export function dateLabel(date: string | null, now: string) {
  if (!date) return "—";
  if (date === now) return "Today";
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric",
    year: date.slice(0, 4) !== now.slice(0, 4) ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
}
function web(value: string) {
  if (!value) return "";
  const u = new URL(
    /^[a-z][\w+.-]*:/i.test(value) ? value : "https://" + value,
  );
  if (
    !["https:", "http:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    !u.hostname.includes(".")
  )
    throw new Error("Enter a valid website or source URL.");
  return u.href;
}
export function clean(input: Fields): Fields {
  const fields = { ...empty };
  for (const k of [
    "company",
    "website",
    "opportunity",
    "contact",
    "source",
    "notes",
  ] as const) {
    if (typeof input[k] !== "string" || input[k].length > 10000)
      throw new Error("Check the length of your fields.");
    fields[k] = input[k].trim();
  }
  if (!fields.company || fields.company.length > 180)
    throw new Error("Enter a company name (up to 180 characters).");
  fields.website = web(fields.website);
  fields.source = web(fields.source);
  if (!statuses.includes(input.status))
    throw new Error("Choose a valid status.");
  fields.status = input.status;
  fields.follow_up = input.follow_up || null;
  if (
    fields.follow_up &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(fields.follow_up) ||
      !Number.isFinite(Date.parse(fields.follow_up)) ||
      new Date(fields.follow_up + "T12:00:00Z").toISOString().slice(0, 10) !==
        fields.follow_up)
  )
    throw new Error("Choose a valid follow-up date.");
  return fields;
}
function domain(url: string) {
  return url ? new URL(url).host.toLowerCase().replace(/^www\./, "") : "";
}
export function duplicate(a: Fields, b: Fields) {
  return a.website && b.website
    ? domain(a.website) === domain(b.website)
    : a.company.trim().toLowerCase() === b.company.trim().toLowerCase();
}
export function preview(text: string, existing: Fields[]) {
  const seen = [...existing];
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((x) => x.trim());
  const fence = (line: string) => /^ *```/.test(line);
  if (lines.some(fence)) {
    if (
      !/^ *```[\w-]*\s*$/.test(lines[0]) ||
      lines.at(-1)?.trim() !== "```" ||
      lines.length < 2 ||
      lines.slice(1, -1).some(fence)
    )
      return {
        rows: [],
        problem:
          "Paste one complete code block or just its tab-separated contents.",
      };
    lines.shift();
    lines.pop();
  }
  if (
    lines.some(
      (line) =>
        !line.includes("\t") &&
        (/^\s*\|/.test(line) ||
          /\|\s*:?-{3,}/.test(line) ||
          (line.match(/\|/g)?.length ?? 0) >= 2),
    )
  )
    return {
      rows: [],
      problem:
        "This looks like a Markdown table. Ask for tab-separated columns, then paste the result here.",
    };
  if (lines[0]?.trim().toLowerCase() === columns.join("\t").toLowerCase())
    lines.shift();
  const rows = lines.map((line) => {
    const [
      company = "",
      website = "",
      opportunity = "",
      contact = "",
      source = "",
      notes = "",
      ...extra
    ] = line.split("\t");
    const raw = {
      ...empty,
      company,
      website,
      opportunity,
      contact,
      source,
      notes,
    };
    try {
      if (extra.length) throw new Error("Too many columns");
      const fields = clean(raw);
      if (seen.some((other) => duplicate(fields, other)))
        return { fields, label: "Duplicate" };
      seen.push(fields);
      return { fields, label: "Ready" };
    } catch (e) {
      return {
        fields: raw,
        label: e instanceof Error ? e.message : "Invalid row",
      };
    }
  });
  return { rows, problem: "" };
}
