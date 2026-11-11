const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const projectCallToken = (value: string) =>
  value === value.trim() && new RegExp(`^${uuid}$`, "i").test(value);

export function projectCallPath(value: unknown): string | null {
  return typeof value === "string" &&
    value === value.trim() &&
    new RegExp(`^/project-call/${uuid}$`, "i").test(value)
    ? value
    : null;
}

// The destination is configured by a founder, never supplied by the visitor.
// Keep this allowlist aligned with the database configuration constraint.
export function googleProjectCallUrl(value: unknown): string | null {
  return typeof value === "string" &&
    value === value.trim() &&
    /^https:\/\/(calendar\.google\.com\/calendar\/appointments\/schedules\/[A-Za-z0-9_-]+|calendar\.app\.google\/[A-Za-z0-9_-]+)(\?gv=true)?$/.test(value)
    ? value
    : null;
}
