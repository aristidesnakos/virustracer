"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { voyageStops, caseLocations, summary } from "@/data/outbreak";
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

function voyageGeoJSON() {
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: voyageStops.map((s) => s.coords),
        },
        properties: {},
      },
    ],
  };
}

function stopsGeoJSON() {
  return {
    type: "FeatureCollection" as const,
    features: voyageStops.map((stop) => ({
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
      // Dot size scales primarily with confirmed cases; monitored contributes
      // softly so countries with only-monitoring activity still register.
      const weight = loc.confirmed * 3 + loc.monitored * 0.25;
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: loc.coords },
        properties: {
          country: loc.country,
          flag: loc.flag,
          confirmed: loc.confirmed,
          deaths: loc.deaths,
          monitored: loc.monitored,
          type: loc.type,
          asOf: loc.asOf,
          daysAgo: Math.max(0, daysBetween(loc.asOf, referenceISO)),
          dotRadius: Math.max(8, Math.min(20, weight + 7)),
          haloRadius: Math.max(18, Math.min(46, weight * 1.8 + 16)),
          label: loc.confirmed > 0 ? String(loc.confirmed) : "",
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
      center: [-15, 15],
      zoom: 1.8,
      minZoom: 1,
      maxZoom: 8,
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
      // ── Voyage route line ──────────────────────────────────────
      map.addSource("voyage-route", {
        type: "geojson",
        data: voyageGeoJSON(),
      });

      map.addLayer({
        id: "voyage-line",
        type: "line",
        source: "voyage-route",
        paint: {
          "line-color": "#60a5fa",
          "line-width": 1,
          "line-dasharray": [3, 2],
          "line-opacity": 0.35,
        },
      });

      // ── Voyage stops ───────────────────────────────────────────
      map.addSource("voyage-stops", {
        type: "geojson",
        data: stopsGeoJSON(),
      });

      map.addLayer({
        id: "stops-circle",
        type: "circle",
        source: "voyage-stops",
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
        data: casesGeoJSON(summary.lastUpdated),
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

      // Inline count label on dots that have confirmed cases. Keeps the data
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

      // ── Tooltips — voyage stops ────────────────────────────────
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
               <div class="popup-title">${p.name}</div>
               <div class="popup-sub">${p.location}</div>
               <div class="popup-date">${new Date(p.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
               ${p.event ? `<div class="popup-note">${p.event}</div>` : ""}
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
        if (p.confirmed > 0) lines.push(`<span class="popup-stat orange">${p.confirmed} confirmed</span>`);
        if (p.deaths > 0) lines.push(`<span class="popup-stat red">${p.deaths} death${p.deaths > 1 ? "s" : ""}</span>`);
        if (p.monitored > 0) lines.push(`<span class="popup-stat yellow">${p.monitored} monitored</span>`);
        const freshness = p.daysAgo === 0 ? "today" : `${p.daysAgo}d ago`;
        casePopup
          .setLngLat(geom.coordinates)
          .setHTML(
            `<div class="popup-inner">
               <div class="popup-title">${p.flag} ${p.country}</div>
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
          <span
            className="w-3 h-0.5 bg-blue-400 opacity-70 shrink-0"
            style={{ borderTop: "1.5px dashed" }}
          />
          Voyage route
        </div>
      </div>
    </div>
  );
}
