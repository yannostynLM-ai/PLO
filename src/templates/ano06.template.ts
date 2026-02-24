// =============================================================================
// Template ANO-06 — Problème constaté pendant l'installation
// =============================================================================

interface Ano06Data {
  projectId: string;
  customerId: string;
  installationId: string | null;
  technicianName?: string;
  issueType?: string;
  issueDescription?: string;
  scheduledDate: Date | null;
  isBlocking: boolean;
}

export function ano06Subject(data: Ano06Data): string {
  const blocking = data.isBlocking ? " BLOQUANT" : "";
  return `[PLO] 🔴 Incident${blocking} installation — ticket SAV requis (${data.customerId})`;
}

export function ano06Html(data: Ano06Data): string {
  const dateStr = data.scheduledDate
    ? data.scheduledDate.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "non renseignée";

  const blockingBanner = data.isBlocking
    ? `<div style="background: #7c2d12; color: white; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; text-align: center;">
      <strong>⛔ INCIDENT BLOQUANT — Intervention suspendue</strong>
    </div>`
    : "";

  return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Alerte PLO — ANO-06</title></head>
<body style="font-family: Arial, sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #dc2626; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
    <strong>🔴 CRITIQUE — Problème pendant installation (ANO-06${data.isBlocking ? "/ANO-12" : ""})</strong>
  </div>
  <div style="border: 1px solid #dc2626; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
    ${blockingBanner}
    <p>Un problème a été signalé par le technicien lors de l'intervention à domicile. Un ticket SAV doit être créé immédiatement.</p>

    <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
      <tr style="background: #f3f4f6;">
        <td style="padding: 8px 12px; font-weight: bold;">Dossier client</td>
        <td style="padding: 8px 12px;">${data.customerId}</td>
      </tr>
      ${
        data.technicianName
          ? `<tr>
        <td style="padding: 8px 12px; font-weight: bold;">Technicien</td>
        <td style="padding: 8px 12px;">${data.technicianName}</td>
      </tr>`
          : ""
      }
      <tr ${data.technicianName ? 'style="background: #f3f4f6;"' : ""}>
        <td style="padding: 8px 12px; font-weight: bold;">Date d'intervention</td>
        <td style="padding: 8px 12px;">${dateStr}</td>
      </tr>
      ${
        data.issueType
          ? `<tr style="background: #fef2f2;">
        <td style="padding: 8px 12px; font-weight: bold;">Type de problème</td>
        <td style="padding: 8px 12px; color: #dc2626; font-weight: bold;">${data.issueType}</td>
      </tr>`
          : ""
      }
      ${
        data.issueDescription
          ? `<tr>
        <td style="padding: 8px 12px; font-weight: bold;">Description</td>
        <td style="padding: 8px 12px;">${data.issueDescription}</td>
      </tr>`
          : ""
      }
    </table>

    <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; margin: 16px 0;">
      <strong>Actions requises :</strong>
      <ul style="margin: 8px 0; padding-left: 20px;">
        <li>Créer un ticket SAV dans le CRM</li>
        <li>Contacter le client pour l'informer et convenir d'une suite</li>
        <li>Vérifier la disponibilité des pièces ou produits manquants</li>
        <li>Planifier une seconde intervention si nécessaire</li>
        ${data.isBlocking ? "<li><strong>Suspendre l'intervention jusqu'à résolution</strong></li>" : ""}
      </ul>
    </div>

    <p style="font-size: 12px; color: #6b7280; margin-top: 24px;">
      Alerte générée par PLO — Project Lifecycle Orchestrator<br>
      Projet : ${data.projectId}${data.installationId ? ` | Installation : ${data.installationId}` : ""}
    </p>
  </div>
</body>
</html>`.trim();
}

export function ano06Text(data: Ano06Data): string {
  const dateStr = data.scheduledDate
    ? data.scheduledDate.toLocaleDateString("fr-FR")
    : "non renseignée";

  return [
    `=== CRITIQUE — ANO-06${data.isBlocking ? "/ANO-12" : ""} : Problème pendant installation ===`,
    "",
    data.isBlocking ? "⛔ INCIDENT BLOQUANT — Intervention suspendue" : "",
    "",
    `Dossier client : ${data.customerId}`,
    data.technicianName ? `Technicien     : ${data.technicianName}` : "",
    `Date interv.   : ${dateStr}`,
    data.issueType ? `Type problème  : ${data.issueType}` : "",
    data.issueDescription ? `Description    : ${data.issueDescription}` : "",
    "",
    "Actions requises :",
    "  - Créer un ticket SAV dans le CRM",
    "  - Contacter le client pour l'informer et convenir d'une suite",
    "  - Vérifier la disponibilité des pièces ou produits manquants",
    "  - Planifier une seconde intervention si nécessaire",
    data.isBlocking ? "  - Suspendre l'intervention jusqu'à résolution" : "",
    "",
    `Projet PLO : ${data.projectId}`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}
