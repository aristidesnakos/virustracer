"use client";

import dynamic from "next/dynamic";

const OutbreakMap = dynamic(() => import("@/components/OutbreakMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
    </div>
  ),
});

export default function MapLoader() {
  return <OutbreakMap />;
}
