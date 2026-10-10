// The /commercial-data page. Pure and client-safe.
//
// A demand test, like the alerts widget: the paid H5N1 feed it describes is not
// built, and the page says so. The price is real, so a sign-up means someone saw
// it and still asked. Sign-ups go through /api/alert-interest as kind
// "commercial"; nothing is charged anywhere.

export const COMMERCIAL_PATH = "/commercial-data";

/** Shown on the page and repeated in each sign-up email, so a later price change is visible per sign-up. */
export const PILOT_PRICE_USD_PER_MONTH = 300;

export const MAX_USE_LENGTH = 500;

export const BUYER_SEGMENTS = [
  { value: "egg-poultry-buyer", label: "Egg or poultry buyer (manufacturing, retail, foodservice)" },
  { value: "producer", label: "Egg or poultry producer" },
  { value: "trader", label: "Commodity trader or analyst" },
  { value: "insurer", label: "Insurer or reinsurer" },
  { value: "animal-health", label: "Animal health (vaccines, diagnostics, veterinary)" },
  { value: "public-sector", label: "Government or public health" },
  { value: "research-media", label: "Research, media or NGO" },
  { value: "other", label: "Something else" },
] as const;

export type BuyerSegment = (typeof BUYER_SEGMENTS)[number]["value"];

export function parseSegment(value: unknown): BuyerSegment | null {
  return BUYER_SEGMENTS.find((s) => s.value === value)?.value ?? null;
}

export function segmentLabel(value: BuyerSegment): string {
  return BUYER_SEGMENTS.find((s) => s.value === value)!.label;
}

/**
 * The optional "what would this help you decide" answer. It is free text that
 * lands in an email and a chat webhook, so control characters and angle brackets
 * (Slack's `<!channel>`) are removed, whitespace is collapsed and the length capped.
 */
export function parseUse(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value
    .replace(/[\p{Cc}\p{Cf}<>]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_USE_LENGTH);
  return clean === "" ? null : clean;
}
