import { SITE_URL } from "@/lib/site";

/**
 * The DataFast browser script (sets the `datafast_visitor_id` cookie that goals need). Loaded
 * only when `NEXT_PUBLIC_DATAFAST_WEBSITE_ID` is set (DataFast → site → Setup). The website id is
 * public by design; the server key `DATAFAST_API_KEY` is a different value and never reaches the page.
 */
export function dataFastScript(
  websiteId: string | undefined = process.env.NEXT_PUBLIC_DATAFAST_WEBSITE_ID,
): { src: string; websiteId: string; domain: string } | null {
  const id = websiteId?.trim();
  if (!id) return null;
  return { src: "https://datafa.st/js/script.js", websiteId: id, domain: new URL(SITE_URL).hostname };
}
