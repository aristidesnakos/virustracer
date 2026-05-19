import * as React from "react";
import { cn } from "@/lib/utils";

export function Metric({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="metric"
      className={cn(
        "text-2xl font-semibold tabular-nums text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
