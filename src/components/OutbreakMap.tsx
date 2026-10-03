"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { CaseLocation, OutbreakMapView, SpreadStop } from "@/data/outbreaks";
import { daysBetween } from "@/lib/outbreak-trend";

const CARTO_LIGHT = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// Recency gradient: stops are interpolated by `daysAgo` on the case dots.
// Fresh data reads as deep oxblood; stale data cools to slate. Every stop is
// >= 4:1 against the pale basemap, and white labels are >= 4.8:1 on each stop.
// MapLibre cannot parse oklch(), so these are the hex equivalents of the
// journal palette.
const RECENCY_STOPS: ReadonlyArray<[number, string]> = [
  [0, "#8a0314"],   // 0 days — oxblood
  [4, "#a63c0c"],   // 4 days — burnt sienna
  [10, "#a46311"],  // 10 days — ochre
  [21, "#327382"],  // 21 days — teal slate
  [45, "#5c646f"],  // 45+ days — slate
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
function referenceISO(caseLocations: readonly CaseLocation[]): string {
  return caseLocations.reduce(
    (max, l) => (l.asOf > max ? l.asOf : max),
    caseLocations[0]?.asOf ?? new Date().toISOString().slice(0, 10),
  );
}

/** The stops in order as one line, e.g. a ship's route. */
function routeGeoJSON(spreadStops: readonly SpreadStop[]) {
  return {
    type: "Feature" as const,
    geometry: { type: "LineString" as const, coordinates: spreadStops.map((s) => s.coords) },
    properties: {},
  };
}

/** Bounding box of every marker, for maps framed to their data. */
function dataBounds(
  spreadStops: readonly SpreadStop[],
  caseLocations: readonly CaseLocation[],
): maplibregl.LngLatBoundsLike | undefined {
  const coords = [...spreadStops.map((s) => s.coords), ...caseLocations.map((l) => l.coords)];
  if (coords.length === 0) return undefined;
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

function stopsGeoJSON(spreadStops: readonly SpreadStop[]) {
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

function casesGeoJSON(caseLocations: readonly CaseLocation[], referenceISO: string) {
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
          monitored: loc.monitored ?? 0,
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

export default function OutbreakMap({
  spreadStops,
  caseLocations,
  view,
  archived = false,
}: {
  spreadStops: SpreadStop[];
  caseLocations: CaseLocation[];
  /** Framing, route line and stop label. Without it: the Central Africa view, no route. */
  view?: OutbreakMapView;
  /** A closed record: recency is relative to its latest data, never "today". */
  archived?: boolean;
}) {
  const stopsLabel = view?.stopsLabel ?? "First-detected site";
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // A view with no centre is framed to its own markers.
    const fit = view && !view.center ? dataBounds(spreadStops, caseLocations) : undefined;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: CARTO_LIGHT,
      ...(fit
        ? { bounds: fit, fitBoundsOptions: { padding: 40, maxZoom: 5 } }
        : { center: view?.center ?? [24, 2], zoom: view?.zoom ?? 3.2 }),
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
      // ── Route line (e.g. a ship's voyage), under the markers ─────────────
      if (view?.route && spreadStops.length > 1) {
        map.addSource("route", { type: "geojson", data: routeGeoJSON(spreadStops) });
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#29579a",
            "line-width": 1.5,
            "line-dasharray": [3, 2],
            "line-opacity": 0.6,
          },
        });
      }

      // ── First-detection sites ───────────────────────────────────────────
      map.addSource("spread-stops", {
        type: "geojson",
        data: stopsGeoJSON(spreadStops),
      });

      map.addLayer({
        id: "stops-circle",
        type: "circle",
        source: "spread-stops",
        paint: {
          "circle-radius": 3.5,
          "circle-color": "#29579a",
          "circle-opacity": 0.85,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
        },
      });

      // ── Case / monitoring bubbles ──────────────────────────────
      // Dot color is interpolated on daysAgo so recency reads at a glance:
      // fresh data is oxblood, stale data fades to slate.
      map.addSource("cases", {
        type: "geojson",
        data: casesGeoJSON(caseLocations, referenceISO(caseLocations)),
      });

      const recencyColor = recencyColorExpression();

      map.addLayer({
        id: "cases-halo",
        type: "circle",
        source: "cases",
        paint: {
          "circle-radius": ["get", "haloRadius"],
          "circle-color": recencyColor,
          "circle-opacity": 0.2,
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
          "text-halo-color": "rgba(21,32,45,0.7)",
          "text-halo-width": 1.5,
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
          deaths: number; monitored: number; type: string;
          asOf: string; daysAgo: number;
        };
        const geom = feat.geometry as unknown as { coordinates: [number, number] };
        const lines: string[] = [];
        if (p.confirmed > 0) lines.push(`<span class="popup-stat confirmed">${fmt(p.confirmed)} confirmed</span>`);
        if (p.deaths > 0) lines.push(`<span class="popup-stat death">${fmt(p.deaths)} death${p.deaths > 1 ? "s" : ""}</span>`);
        if (p.monitored > 0) lines.push(`<span class="popup-stat">${fmt(p.monitored)} monitored</span>`);
        const freshness = archived
          ? `as of ${new Date(p.asOf).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`
          : `updated ${p.daysAgo === 0 ? "today" : `${p.daysAgo}d ago`}`;
        casePopup
          .setLngLat(geom.coordinates)
          .setHTML(
            `<div class="popup-inner">
               <div class="popup-title">${escapeHtml(p.flag)} ${escapeHtml(p.country)}</div>
               <div class="popup-stats">${lines.join(" · ")}</div>
               <div class="popup-date">${escapeHtml(freshness)}</div>
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
  }, [spreadStops, caseLocations, view, archived]);

  return (
    <div className="flex h-full w-full flex-col">
      <div
        ref={containerRef}
        role="region"
        aria-label="Map of reported cases. The same figures are listed in Table 1."
        className="min-h-0 w-full flex-1"
      />
      {/* Legend sits under the map so it never hides data on small screens */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-t border-rule bg-panel px-4 py-3 text-[0.8125rem] text-ink-muted">
        {caseLocations.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-ink">Data recency</span>
          <span className="tabular-nums">{archived ? "latest" : "today"}</span>
          <div
            className="h-2 w-28 rounded-full border border-rule-strong"
            style={{
              background:
                "linear-gradient(to right, #8a0314 0%, #a63c0c 22%, #a46311 47%, #327382 78%, #5c646f 100%)",
            }}
            aria-hidden
          />
          <span className="tabular-nums">45d+</span>
        </div>
        )}
        <div className="flex items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-full border border-white bg-confirmed"
            aria-hidden
          />
          {stopsLabel}
        </div>
        {caseLocations.length > 0 && <div>Dot label: deaths · size: confirmed cases</div>}
      </div>
    </div>
  );
}
