import { severityColor, severityDot, severityLabel } from "../lib/utils.ts";
import type { Severity, AnomalySeverity } from "../lib/api.ts";

interface Props {
  severity: Severity | AnomalySeverity;
  size?: "sm" | "md";
}

export default function SeverityBadge({ severity, size = "md" }: Props) {
  const base = size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-2.5 py-1";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${base} ${severityColor(severity)}`}
    >
      <span className={`h-2 w-2 rounded-full ${severityDot(severity)}`} />
      {severityLabel(severity)}
    </span>
  );
}
