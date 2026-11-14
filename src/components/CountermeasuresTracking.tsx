"use client";

import { useEffect, useRef } from "react";
import {
  trackCountermeasuresMethodClick,
  trackCountermeasuresSourceClick,
  trackCountermeasuresView,
} from "@/lib/analytics";

/**
 * Measures the vaccines-and-treatments pilot box with DataFast goals: one `countermeasures_view`
 * when the box is a quarter visible (once per page load), and a goal per click on a link marked
 * with `data-cm-goal` ("source" or "method"). Renders nothing visible; it attaches to the
 * enclosing <section>, so the box itself stays a Server Component.
 */
export default function CountermeasuresTracking({ pathogen, outbreak }: { pathogen: string; outbreak: string }) {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const section = marker.current?.closest("section");
    if (!section) return;
    const context = { pathogen, outbreak };

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            void trackCountermeasuresView(context);
            observer?.disconnect();
          }
        },
        { threshold: 0.25 },
      );
      observer.observe(section);
    }

    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest<HTMLElement>("[data-cm-goal]");
      if (!link || !section.contains(link)) return;
      if (link.dataset.cmGoal === "method") {
        void trackCountermeasuresMethodClick(context);
      } else if (link.dataset.cmGoal === "source") {
        void trackCountermeasuresSourceClick({
          ...context,
          product: link.dataset.cmProduct ?? "",
          tier: link.dataset.cmTier ?? "",
          source_kind: link.dataset.cmKind ?? "",
        });
      }
    };
    section.addEventListener("click", onClick);
    return () => {
      observer?.disconnect();
      section.removeEventListener("click", onClick);
    };
  }, [pathogen, outbreak]);

  return <span ref={marker} hidden />;
}
