"use client";

import dynamic from "next/dynamic";

import type { CaseLocation, SpreadStop } from "@/data/outbreaks";

const OutbreakMap = dynamic(() => import("@/components/OutbreakMap"), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      aria-label="Loading map"
      className="flex h-full w-full items-center justify-center bg-sunk"
    >
      <div className="size-6 animate-spin rounded-full border-2 border-rule-strong border-t-accent motion-reduce:animate-none" />
    </div>
  ),
});

export default function MapLoader({
  spreadStops,
  caseLocations,
}: {
  spreadStops: SpreadStop[];
  caseLocations: CaseLocation[];
}) {
  return <OutbreakMap spreadStops={spreadStops} caseLocations={caseLocations} />;
}
