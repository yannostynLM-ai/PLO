// =============================================================================
// Template ANO-02 — Écart picking avant départ camion
// =============================================================================

interface Ano02Data {
  projectId: string;
  customerId: string;
  orderId: string | null;
  erpRef: string | null;
  discrepancyDetail?: string;
  promisedDeliveryDate: Date | null;
}

export function ano02Subject(data: Ano02Data): string {
  return `[PLO] 🔴 Écart picking — BLOQUER LE CHARGEMENT (${data.customerId})`;
}

export function ano02Html(data: Ano02Data): string {
  const dateStr = data.promisedDeliveryDate
    ? data.promisedDeliveryDate.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "non renseignée";

  return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Alerte PLO — ANO-02</title></head>
<body style="font-family: Arial, sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #dc2626; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
    <strong>🔴 CRITIQUE — Écart picking avant départ (ANO-02)</strong>
  </div>
  <div style="border: 1px solid #dc2626; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
    <div style="background: #fef2f2; border: 2px solid #dc2626; padding: 16px; border-radius: 6px; margin-bottom: 20px; text-align: center;">
      <strong style="font-size: 18px; color: #dc2626;">⛔ BLOQUER LE CHARGEMENT IMMÉDIATEMENT</strong>
    </div>

    <p>Un écart a été constaté en picking <strong>avant le départ du camion</strong>. Le chargement doit être bloqué le temps de résoudre la discordance.</p>

    <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
      <tr style="background: #f3f4f6;">
        <td style="padding: 8px 12px; font-weight: bold;">Dossier client</td>
        <td style="padding: 8px 12px;">${data.customerId}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-weight: bold;">Commande ERP</td>
        <td style="padding: 8px 12px;">${data.erpRef ?? data.orderId ?? "—"}</td>
      </tr>
      ${
        data.discrepancyDetail
          ? `<tr style="background: #fef2f2;">
        <td style="padding: 8px 12px; font-weight: bold;">Détail de l'écart</td>
        <td style="padding: 8px 12px; color: #dc2626;">${data.discrepancyDetail}</td>
      </tr>`
          : ""
      }
      <tr>
        <td style="padding: 8px 12px; font-weight: bold;">Livraison promise</td>
        <td style="padding: 8px 12px;">${dateStr}</td>
      </tr>
    </table>

    <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; margin: 16px 0;">
      <strong>Actions immédiates :</strong>
      <ul style="margin: 8px 0; padding-left: 20px;">
        <li>Bloquer le chargement en attente de validation</li>
        <li>Vérifier physiquement la préparation en entrepôt</li>
        <li>Corriger l'écart ou mettre à jour la commande</li>
        <li>Débloquer manuellement après résolution</li>
      </ul>
    </div>

    <p style="font-size: 12px; color: #6b7280; margin-top: 24px;">
      Alerte générée par PLO — Project Lifecycle Orchestrator<br>
      Projet : ${data.projectId}
    </p>
  </div>
</body>
</html>`.trim();
}

export function ano02Text(data: Ano02Data): string {
  const dateStr = data.promisedDeliveryDate
    ? data.promisedDeliveryDate.toLocaleDateString("fr-FR")
    : "non renseignée";

  return [
    "=== CRITIQUE — ANO-02 : Écart picking avant départ camion ===",
    "",
    "⛔ BLOQUER LE CHARGEMENT IMMÉDIATEMENT",
    "",
    `Dossier client : ${data.customerId}`,
    `Commande ERP   : ${data.erpRef ?? data.orderId ?? "—"}`,
    data.discrepancyDetail ? `Écart          : ${data.discrepancyDetail}` : "",
    `Livraison      : ${dateStr}`,
    "",
    "Actions immédiates :",
    "  - Bloquer le chargement en attente de validation",
    "  - Vérifier physiquement la préparation en entrepôt",
    "  - Corriger l'écart ou mettre à jour la commande",
    "  - Débloquer manuellement après résolution",
    "",
    `Projet PLO : ${data.projectId}`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}
