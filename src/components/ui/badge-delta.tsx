import * as React from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export type DeltaTone = "increase" | "decrease" | "unchanged";

export function deltaTone(delta: number): DeltaTone {
  if (delta > 0) return "increase";
  if (delta < 0) return "decrease";
  return "unchanged";
}

const toneStyles: Record<DeltaTone, string> = {
  increase: "bg-red-500/10 text-red-300 ring-red-500/30",
  decrease: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  unchanged: "bg-white/[0.04] text-gray-400 ring-white/10",
};

const toneIcon: Record<DeltaTone, React.ComponentType<{ className?: string }>> = {
  increase: ArrowUp,
  decrease: ArrowDown,
  unchanged: Minus,
};

export interface BadgeDeltaProps extends React.ComponentProps<"span"> {
  delta: number;
  /** Optional override; defaults to sign of delta. */
  tone?: DeltaTone;
  /** Custom formatter for the numeric value (default: `+n` / `−n`). */
  format?: (delta: number) => string;
}

export function BadgeDelta({
  delta,
  tone,
  format,
  className,
  ...props
}: BadgeDeltaProps) {
  const resolvedTone = tone ?? deltaTone(delta);
  const Icon = toneIcon[resolvedTone];
  const label = format
    ? format(delta)
    : delta === 0
      ? "0"
      : `${delta > 0 ? "+" : "−"}${Math.abs(delta)}`;
  return (
    <span
      data-slot="badge-delta"
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums ring-1 ring-inset",
        toneStyles[resolvedTone],
        className,
      )}
      {...props}
    >
      <Icon className="size-2.5" aria-hidden />
      {label}
    </span>
  );
}
