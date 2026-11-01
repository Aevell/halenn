import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/pricing", "/about", "/privacy", "/cookies", "/terms", "/business"].map(path => ({ url: `https://halenn.com${path}` }));
}
