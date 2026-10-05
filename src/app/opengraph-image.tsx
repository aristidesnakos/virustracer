import { ImageResponse } from "next/og";
import { listOutbreaks } from "@/data/outbreaks";
import { BrandMark } from "@/components/BrandMark";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const alt = `${SITE_NAME}: ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Site-level share card: the name, what the site is, and how many outbreaks it
// tracks. No per-outbreak figures (each outbreak page has its own card). Same
// palette as the outbreak card, as hex because ImageResponse does not read oklch.
export default function OpengraphImage() {
  // Outbreaks declared over are records on file, not tracked; they are counted apart.
  const count = listOutbreaks().filter((o) => o.status !== "over").length;
  const onFile = listOutbreaks().length - count;
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
        <div style={{ fontSize: 30, letterSpacing: 4, color: "#8a2a1f", fontWeight: 700 }}>
          OUTBREAK DATA, ON THE RECORD
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 32, marginTop: 20, fontSize: 112, fontWeight: 700, lineHeight: 1.05 }}>
            <BrandMark size={104} />
            {SITE_NAME}
          </div>
          <div style={{ fontSize: 42, color: "#4a5568", marginTop: 24, lineHeight: 1.3 }}>
            {SITE_TAGLINE}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 64, fontWeight: 700, color: "#8a2a1f", lineHeight: 1 }}>
            {`${count} ${count === 1 ? "outbreak" : "outbreaks"} tracked`}
          </div>
          {onFile > 0 && (
            <div style={{ fontSize: 34, color: "#4a5568", marginTop: 12 }}>
              {`and ${onFile} past ${onFile === 1 ? "outbreak" : "outbreaks"} on file`}
            </div>
          )}
          <div style={{ fontSize: 26, color: "#4a5568", marginTop: 16 }}>
            Unofficial dashboard · free data API · sources and archive links on every figure
          </div>
        </div>
      </div>
    ),
    size,
  );
}
