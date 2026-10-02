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
  increase: "bg-death-tint text-death ring-death/30",
  decrease: "bg-good-tint text-good ring-good/30",
  unchanged: "bg-sunk text-ink-muted ring-rule-strong/60",
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
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.8125rem] font-semibold tabular-nums ring-1 ring-inset",
        toneStyles[resolvedTone],
        className,
      )}
      {...props}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}
