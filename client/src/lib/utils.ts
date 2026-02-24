import type { Severity, AnomalySeverity } from "./api.ts";

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

export function severityColor(severity: Severity | AnomalySeverity): string {
  switch (severity) {
    case "critical":
      return "bg-red-100 text-red-700 border-red-200";
    case "warning":
      return "bg-orange-100 text-orange-700 border-orange-200";
    case "ok":
    default:
      return "bg-green-100 text-green-700 border-green-200";
  }
}

export function severityDot(severity: Severity | AnomalySeverity): string {
  switch (severity) {
    case "critical":
      return "bg-red-500";
    case "warning":
      return "bg-orange-400";
    case "ok":
    default:
      return "bg-green-500";
  }
}

export function severityLabel(severity: Severity | AnomalySeverity): string {
  switch (severity) {
    case "critical":
      return "Critique";
    case "warning":
      return "Warning";
    case "ok":
      return "OK";
  }
}

export function stepStatusColor(status: string): string {
  switch (status) {
    case "completed":
      return "text-green-600 bg-green-50 border-green-200";
    case "in_progress":
      return "text-blue-600 bg-blue-50 border-blue-200";
    case "anomaly":
      return "text-red-600 bg-red-50 border-red-200";
    case "skipped":
      return "text-gray-400 bg-gray-50 border-gray-200";
    case "pending":
    default:
      return "text-gray-500 bg-gray-50 border-gray-200";
  }
}

export function stepStatusIcon(status: string): string {
  switch (status) {
    case "completed":
      return "✓";
    case "in_progress":
      return "⟳";
    case "anomaly":
      return "!";
    case "skipped":
      return "—";
    case "pending":
    default:
      return "○";
  }
}

export function stepStatusLabel(status: string): string {
  switch (status) {
    case "completed":
      return "Terminé";
    case "in_progress":
      return "En cours";
    case "anomaly":
      return "Anomalie";
    case "skipped":
      return "Ignoré";
    case "pending":
    default:
      return "En attente";
  }
}

export function projectStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "Brouillon",
    active: "Actif",
    on_hold: "En pause",
    completed: "Terminé",
    cancelled: "Annulé",
  };
  return labels[status] ?? status;
}

export function projectTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    kitchen: "Cuisine",
    bathroom: "Salle de bain",
    energy_renovation: "Rénovation énergétique",
    other: "Autre",
  };
  return labels[type] ?? type;
}
