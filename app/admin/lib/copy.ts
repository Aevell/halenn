/** Keep generated and copied outreach consistent with Halenn's punctuation. */
export function withoutEmDashes(value: string) {
  return value.replace(/\s*\u2014\s*/g, ", ");
}
