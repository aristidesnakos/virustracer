"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { spreadStops, caseLocations } from "@/data/outbreak";
import { daysBetween } from "@/lib/outbreak-trend";

const CARTO_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// Recency gradient: stops are interpolated by `daysAgo` on the case dots.
// Fresh data reads hot (red/orange); stale data fades to muted blue-gray.
const RECENCY_STOPS: ReadonlyArray<[number, string]> = [
  [0, "#ef4444"],   // 0 days — red-500
  [4, "#fb923c"],   // 4 days — orange-400
  [10, "#facc15"],  // 10 days — yellow-400
  [21, "#60a5fa"],  // 21 days — blue-400
  [45, "#6b7280"],  // 45+ days — gray-500
];

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const fmt = (n: number) => n.toLocaleString("en-US");

/** Compact label for dots: 2885 -> "2.9k", 931 -> "931", 0 -> "". */
function compactCount(n: number): string {
  if (n <= 0) return "";
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}k`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Reference date for the recency gradient: the freshest data on the map.
const REFERENCE_ISO = caseLocations.reduce(
  (max, l) => (l.asOf > max ? l.asOf : max),
  caseLocations[0]?.asOf ?? new Date().toISOString().slice(0, 10),
);

function stopsGeoJSON() {
  return {
    type: "FeatureCollection" as const,
    features: spreadStops.map((stop) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: stop.coords },
      properties: {
        name: stop.name,
        location: stop.location,
        date: stop.date,
        event: stop.event ?? "",
      },
    })),
  };
}

function casesGeoJSON(referenceISO: string) {
  return {
    type: "FeatureCollection" as const,
    features: caseLocations.map((loc) => {
      // sqrt-scaled so Ituri (thousands) and a 1-case marker both stay legible.
      const dotRadius = clamp(6 + Math.sqrt(loc.confirmed) * 0.22, 7, 26);
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: loc.coords },
        properties: {
          country: loc.country,
          flag: loc.flag,
          confirmed: loc.confirmed,
          deaths: loc.deaths,
          type: loc.type,
          asOf: loc.asOf,
          daysAgo: Math.max(0, daysBetween(loc.asOf, referenceISO)),
          dotRadius,
          haloRadius: dotRadius * 2.2,
          label: compactCount(loc.deaths),
        },
      };
    }),
  };
}

function recencyColorExpression(): maplibregl.ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["get", "daysAgo"],
    ...RECENCY_STOPS.flatMap(([d, c]) => [d, c] as [number, string]),
  ] as maplibregl.ExpressionSpecification;
}

export default function OutbreakMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: CARTO_DARK,
      center: [24, 2],
      zoom: 3.2,
      minZoom: 1,
      maxZoom: 9,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right"
    );

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right"
    );

    map.on("load", () => {
      // ── First-detection sites ───────────────────────────────────────────
      map.addSource("spread-stops", {
        type: "geojson",
        data: stopsGeoJSON(),
      });

      map.addLayer({
        id: "stops-circle",
        type: "circle",
        source: "spread-stops",
        paint: {
          "circle-radius": 2.5,
          "circle-color": "#60a5fa",
          "circle-opacity": 0.55,
          "circle-stroke-width": 0,
        },
      });

      // ── Case / monitoring bubbles ──────────────────────────────
      // Dot color is interpolated on daysAgo so recency reads at a glance:
      // fresh data is red/orange, stale data fades to blue-gray.
      map.addSource("cases", {
        type: "geojson",
        data: casesGeoJSON(REFERENCE_ISO),
      });

      const recencyColor = recencyColorExpression();

      map.addLayer({
        id: "cases-halo",
        type: "circle",
        source: "cases",
        paint: {
          "circle-radius": ["get", "haloRadius"],
          "circle-color": recencyColor,
          "circle-opacity": 0.18,
          "circle-stroke-width": 0,
        },
      });

      map.addLayer({
        id: "cases-dot",
        type: "circle",
        source: "cases",
        paint: {
          "circle-radius": ["get", "dotRadius"],
          "circle-color": recencyColor,
          "circle-opacity": 0.95,
          "circle-stroke-color": "rgba(255,255,255,0.85)",
          "circle-stroke-width": 1.5,
        },
      });

      // Inline label shows deaths in compact form. Keeps the data
      // legible without forcing a hover.
      map.addLayer({
        id: "cases-label",
        type: "symbol",
        source: "cases",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 11,
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0,0,0,0.55)",
          "text-halo-width": 1.2,
        },
      });

      // ── Tooltips — first-detection sites ────────────────────────────────
      const stopPopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "map-popup",
        maxWidth: "280px",
      });

      map.on("mouseenter", "stops-circle", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const feat = e.features?.[0];
        if (!feat) return;
        const p = feat.properties as { name: string; location: string; date: string; event: string };
        const geom = feat.geometry as unknown as { coordinates: [number, number] };
        stopPopup
          .setLngLat(geom.coordinates)
          .setHTML(
            `<div class="popup-inner">
               <div class="popup-title">${escapeHtml(p.name)}</div>
               <div class="popup-sub">${escapeHtml(p.location)}</div>
               <div class="popup-date">${new Date(p.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</div>
               ${p.event ? `<div class="popup-note">${escapeHtml(p.event)}</div>` : ""}
             </div>`
          )
          .addTo(map);
      });

      map.on("mouseleave", "stops-circle", () => {
        map.getCanvas().style.cursor = "";
        stopPopup.remove();
      });

      // ── Tooltips — case bubbles ────────────────────────────────
      const casePopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "map-popup",
        maxWidth: "260px",
      });

      map.on("mouseenter", "cases-dot", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const feat = e.features?.[0];
        if (!feat) return;
        const p = feat.properties as {
          country: string; flag: string; confirmed: number;
          deaths: number; type: string;
          asOf: string; daysAgo: number;
        };
        const geom = feat.geometry as unknown as { coordinates: [number, number] };
        const lines: string[] = [];
        if (p.confirmed > 0) lines.push(`<span class="popup-stat orange">${fmt(p.confirmed)} confirmed</span>`);
        if (p.deaths > 0) lines.push(`<span class="popup-stat red">${fmt(p.deaths)} death${p.deaths > 1 ? "s" : ""}</span>`);
        const freshness = p.daysAgo === 0 ? "today" : `${p.daysAgo}d ago`;
        casePopup
          .setLngLat(geom.coordinates)
          .setHTML(
            `<div class="popup-inner">
               <div class="popup-title">${escapeHtml(p.flag)} ${escapeHtml(p.country)}</div>
               <div class="popup-stats">${lines.join(" · ")}</div>
               <div class="popup-date">updated ${freshness}</div>
             </div>`
          )
          .addTo(map);
      });

      map.on("mouseleave", "cases-dot", () => {
        map.getCanvas().style.cursor = "";
        casePopup.remove();
      });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {/* Legend */}
      <div className="absolute bottom-8 left-3 flex flex-col gap-2 bg-gray-950/80 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2.5 text-xs text-gray-300">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
            Data recency
          </span>
          <div
            className="h-1.5 w-32 rounded-full"
            style={{
              background:
                "linear-gradient(to right, #ef4444 0%, #fb923c 22%, #facc15 47%, #60a5fa 78%, #6b7280 100%)",
            }}
          />
          <div className="flex justify-between text-[9px] text-gray-500 tabular-nums">
            <span>today</span>
            <span>45d+</span>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1 border-t border-white/[0.06]">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 opacity-70 shrink-0" />
          First-detected site
        </div>
        <div className="text-[10px] text-gray-500 leading-snug">
          Dot label: deaths · size: confirmed cases
        </div>
      </div>
    </div>
  );
}
