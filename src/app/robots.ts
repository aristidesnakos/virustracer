import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// The JSON/CSV endpoints stay crawlable (dataset discovery follows the links to
// them) but are kept out of search results by an X-Robots-Tag header, see
// next.config.ts.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
