import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/prototypes/hero", "/api/"] }, sitemap: "https://halenn.com/sitemap.xml" };
}
