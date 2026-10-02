import { ImageResponse } from "next/og";
import { casesTimeline, outbreak } from "@/data/outbreak";
import { getTollData } from "@/lib/toll";
import { mergeTimeline } from "@/lib/timeline";
import { latestFigures } from "@/lib/seo";

export const alt = outbreak.seoTitle;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Share card with the current figures baked in, so a link pasted into a chat or
// feed shows the toll rather than a generic logo. Colours are the site palette
// as hex (ImageResponse does not read oklch).
export default function OpengraphImage() {
  const toll = getTollData();
  const figures = latestFigures(mergeTimeline(casesTimeline, toll.snapshots));
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
          <div style={{ fontSize: 30, letterSpacing: 4, color: "#8a2a1f", fontWeight: 700 }}>
            SITUATION JOURNAL
          </div>
          <div style={{ fontSize: 76, fontWeight: 700, marginTop: 16, lineHeight: 1.1 }}>
            {outbreak.title}
          </div>
          <div style={{ fontSize: 34, color: "#4a5568", marginTop: 12 }}>
            2026 · DR Congo &amp; Uganda · Bundibugyo virus
          </div>
        </div>
        <div style={{ display: "flex", gap: 96 }}>
          {stat("Deaths reported", figures?.deaths ?? null, "#8a2a1f")}
          {stat("Confirmed cases", figures?.confirmed ?? null, "#1c2433")}
        </div>
        <div style={{ fontSize: 26, color: "#4a5568" }}>
          {`Unofficial dashboard · figures from WHO and INSP DRC via Wikipedia${
            figures ? ` · as of ${figures.date}` : ""
          }`}
        </div>
      </div>
    ),
    size,
  );
}
