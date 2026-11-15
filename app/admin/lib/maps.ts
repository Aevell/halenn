/** Accept Google's Share > Embed a map output; never render supplied HTML. */
export function mapEmbed(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length > 12000)
    throw new Error("Paste a Google Maps embed link or its copied HTML.");
  let source = value.trim();
  if (!source) return "";
  if (source.startsWith("<")) {
    const match = source.match(/^<iframe\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>\s*<\/iframe>$/i);
    if (!match) throw new Error("Use Google Maps → Share → Embed a map → Copy HTML.");
    source = match[2].replace(/&amp;/g, "&");
  }
  let url: URL;
  try { url = new URL(source); } catch {
    throw new Error("Use Google Maps → Share → Embed a map → Copy HTML.");
  }
  if (url.protocol !== "https:" || url.hostname !== "www.google.com" ||
      url.port || url.username || url.password || url.pathname !== "/maps/embed" ||
      !url.searchParams.get("pb") || url.hash ||
      [...url.searchParams.keys()].some(key => key !== "pb")) {
    throw new Error("Use the embed code from Google Maps, not a regular share link.");
  }
  return url.href;
}
