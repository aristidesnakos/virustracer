"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { voyageStops, caseLocations } from "@/data/outbreak";

const STADIA_DARK = "https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json";

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

function casesGeoJSON() {
  return {
    type: "FeatureCollection" as const,
    features: caseLocations.map((loc) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: loc.coords },
      properties: {
        country: loc.country,
        flag: loc.flag,
        confirmed: loc.confirmed,
        deaths: loc.deaths,
        monitored: loc.monitored,
        type: loc.type,
        radius: Math.max(8, Math.min(28, (loc.confirmed + loc.monitored * 0.3) * 2 + 8)),
      },
    })),
  };
}

export default function OutbreakMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STADIA_DARK,
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
          "line-width": 1.5,
          "line-dasharray": [3, 2],
          "line-opacity": 0.6,
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
          "circle-radius": 4,
          "circle-color": "#93c5fd",
          "circle-opacity": 0.85,
          "circle-stroke-color": "#bfdbfe",
          "circle-stroke-width": 1,
        },
      });

      // ── Case / monitoring bubbles ──────────────────────────────
      map.addSource("cases", {
        type: "geojson",
        data: casesGeoJSON(),
      });

      map.addLayer({
        id: "cases-halo",
        type: "circle",
        source: "cases",
        paint: {
          "circle-radius": ["get", "radius"],
          "circle-color": [
            "match",
            ["get", "type"],
            "origin", "#ef4444",
            "case", "#f97316",
            "monitoring", "#eab308",
            "#6b7280",
          ],
          "circle-opacity": 0.12,
          "circle-stroke-width": 0,
        },
      });

      map.addLayer({
        id: "cases-dot",
        type: "circle",
        source: "cases",
        paint: {
          "circle-radius": 5,
          "circle-color": [
            "match",
            ["get", "type"],
            "origin", "#ef4444",
            "case", "#f97316",
            "monitoring", "#eab308",
            "#6b7280",
          ],
          "circle-opacity": 0.95,
          "circle-stroke-color": "rgba(255,255,255,0.25)",
          "circle-stroke-width": 1.5,
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
        };
        const geom = feat.geometry as unknown as { coordinates: [number, number] };
        const lines: string[] = [];
        if (p.confirmed > 0) lines.push(`<span class="popup-stat orange">${p.confirmed} confirmed</span>`);
        if (p.deaths > 0) lines.push(`<span class="popup-stat red">${p.deaths} death${p.deaths > 1 ? "s" : ""}</span>`);
        if (p.monitored > 0) lines.push(`<span class="popup-stat yellow">${p.monitored} monitored</span>`);
        casePopup
          .setLngLat(geom.coordinates)
          .setHTML(
            `<div class="popup-inner">
               <div class="popup-title">${p.flag} ${p.country}</div>
               <div class="popup-stats">${lines.join(" · ")}</div>
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
      <div className="absolute bottom-8 left-3 flex flex-col gap-1.5 bg-gray-950/80 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2.5 text-xs text-gray-300">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500 opacity-90 shrink-0" />
          Origin / infection source
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-orange-500 opacity-90 shrink-0" />
          Confirmed cases
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-yellow-400 opacity-90 shrink-0" />
          Under monitoring
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5 bg-blue-400 opacity-70 shrink-0" style={{ borderTop: "1.5px dashed" }} />
          Voyage route
        </div>
      </div>
    </div>
  );
}
