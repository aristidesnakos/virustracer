import { ImageResponse } from "next/og";
import { getOutbreak } from "@/data/outbreaks";
import { getTollData } from "@/lib/toll";
import { mergeTimeline } from "@/lib/timeline";
import { latestFigures, shareCardFooter } from "@/lib/seo";
import { BrandMark } from "@/components/BrandMark";
import { SITE_NAME } from "@/lib/site";

// The real alt text names the outbreak, which is only known per request; this is
// the static fallback Next reads from the export.
export const alt = `${SITE_NAME}: current outbreak figures`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Share card with the current figures baked in, so a link pasted into a chat or
// feed shows the toll rather than a generic logo. Colours are the site palette
// as hex (ImageResponse does not read oklch). Read at request time, so it is
// never staler than the page. Unknown slugs get a plain 404, not a card.
export default async function OutbreakOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const outbreak = getOutbreak(slug);
  if (!outbreak) return new Response("Not found", { status: 404 });

  const toll = getTollData(outbreak.slug);
  const figures = latestFigures(mergeTimeline(outbreak.casesTimeline, toll.snapshots));
  const stat = (label: string, value: number | null, color: string) => (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 120, fontWeight: 700, color, lineHeight: 1 }}>
        {value === null ? "—" : value.toLocaleString("en-US")}
      </div>
      <div style={{ fontSize: 34, color: "#4a5568", marginTop: 12 }}>{label}</div>
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f7f3eb",
          color: "#1c2433",
          padding: 72,
          borderBottom: "16px solid #8a2a1f",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, letterSpacing: 4, color: "#8a2a1f", fontWeight: 700 }}>
            <BrandMark size={44} />
            {SITE_NAME.toUpperCase()}
          </div>
          <div style={{ fontSize: 76, fontWeight: 700, marginTop: 16, lineHeight: 1.1 }}>
            {outbreak.title}
          </div>
          <div style={{ fontSize: 34, color: "#4a5568", marginTop: 12 }}>
            {[outbreak.places, outbreak.pathogen].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div style={{ display: "flex", gap: 96 }}>
          {stat(outbreak.summary.deathsQualifier ? `Deaths ${outbreak.summary.deathsQualifier}` : "Deaths reported", figures?.deaths ?? null, "#8a2a1f")}
          {stat("Confirmed cases", figures?.confirmed ?? null, "#1c2433")}
        </div>
        <div style={{ fontSize: 26, color: "#4a5568" }}>
          {shareCardFooter(outbreak, figures)}
        </div>
      </div>
    ),
    size,
  );
}
