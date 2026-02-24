// =============================================================================
// Template ANO-01 — Stock manquant tardif (< 72h avant livraison)
// =============================================================================

interface Ano01Data {
  projectId: string;
  customerId: string;
  orderId: string | null;
  erpRef: string | null;
  sku: string;
  skuLabel?: string;
  promisedDeliveryDate: Date | null;
  hoursRemaining: number;
}

export function ano01Subject(data: Ano01Data): string {
  return `[PLO] 🔴 Stock manquant — livraison dans ${Math.round(data.hoursRemaining)}h (${data.customerId})`;
}

export function ano01Html(data: Ano01Data): string {
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
<head><meta charset="UTF-8"><title>Alerte PLO — ANO-01</title></head>
<body style="font-family: Arial, sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #dc2626; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
    <strong>🔴 CRITIQUE — Stock manquant tardif (ANO-01)</strong>
  </div>
  <div style="border: 1px solid #dc2626; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
    <p>Un produit est en rupture de stock alors que la livraison est prévue dans moins de <strong>${Math.round(data.hoursRemaining)} heures</strong>.</p>

    <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
      <tr style="background: #f3f4f6;">
        <td style="padding: 8px 12px; font-weight: bold;">Dossier client</td>
        <td style="padding: 8px 12px;">${data.customerId}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-weight: bold;">Commande ERP</td>
        <td style="padding: 8px 12px;">${data.erpRef ?? data.orderId ?? "—"}</td>
      </tr>
      <tr style="background: #f3f4f6;">
        <td style="padding: 8px 12px; font-weight: bold;">Produit manquant (SKU)</td>
        <td style="padding: 8px 12px; color: #dc2626; font-weight: bold;">${data.sku}${data.skuLabel ? ` — ${data.skuLabel}` : ""}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-weight: bold;">Date de livraison promise</td>
        <td style="padding: 8px 12px;">${dateStr}</td>
      </tr>
      <tr style="background: #fef2f2;">
        <td style="padding: 8px 12px; font-weight: bold;">Délai restant</td>
        <td style="padding: 8px 12px; color: #dc2626; font-weight: bold;">${Math.round(data.hoursRemaining)}h</td>
      </tr>
    </table>

    <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; margin: 16px 0;">
      <strong>Actions requises :</strong>
      <ul style="margin: 8px 0; padding-left: 20px;">
        <li>Vérifier la disponibilité d'un produit de substitution</li>
        <li>Informer le client du retard potentiel</li>
        <li>Proposer un report de livraison si nécessaire</li>
        <li>Ne pas lancer la préparation sans validation client</li>
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

export function ano01Text(data: Ano01Data): string {
  const dateStr = data.promisedDeliveryDate
    ? data.promisedDeliveryDate.toLocaleDateString("fr-FR")
    : "non renseignée";

  return [
    "=== CRITIQUE — ANO-01 : Stock manquant tardif ===",
    "",
    `Dossier client : ${data.customerId}`,
    `Commande ERP   : ${data.erpRef ?? data.orderId ?? "—"}`,
    `Produit        : ${data.sku}${data.skuLabel ? ` — ${data.skuLabel}` : ""}`,
    `Livraison      : ${dateStr}`,
    `Délai restant  : ${Math.round(data.hoursRemaining)}h`,
    "",
    "Actions requises :",
    "  - Vérifier la disponibilité d'un produit de substitution",
    "  - Informer le client du retard potentiel",
    "  - Proposer un report de livraison si nécessaire",
    "  - Ne pas lancer la préparation sans validation client",
    "",
    `Projet PLO : ${data.projectId}`,
  ].join("\n");
}
