import { ano01Subject, ano01Html, ano01Text } from "./ano01.template.js";

const baseData = {
  projectId: "PRJ-2026-001",
  customerId: "CUST-44821",
  orderId: "ORD-99001",
  erpRef: "ERP-55123",
  skus: ["SKU-KITCHEN-001"],
  sku: "SKU-KITCHEN-001",
  promisedDeliveryDate: new Date("2026-03-15T08:00:00Z"),
  hoursRemaining: 47.6,
};

describe("ano01 — Stock manquant tardif", () => {
  it("subject contains hoursRemaining rounded and customerId", () => {
    const subject = ano01Subject(baseData);
    expect(subject).toContain("48h");
    expect(subject).toContain("CUST-44821");
  });

  it("html contains ANO-01 and the red banner", () => {
    const html = ano01Html(baseData);
    expect(html).toContain("ANO-01");
    expect(html).toContain("background: #dc2626");
  });

  it("html contains customerId in the table", () => {
    const html = ano01Html(baseData);
    expect(html).toContain("Dossier client");
    expect(html).toContain("CUST-44821");
  });

  it("text contains CRITIQUE and customerId", () => {
    const text = ano01Text(baseData);
    expect(text).toContain("CRITIQUE");
    expect(text).toContain("CUST-44821");
  });

  it("multi-SKU: html contains 'Produits manquants' (plural) and both SKUs", () => {
    const data = {
      ...baseData,
      skus: ["SKU-KITCHEN-001", "SKU-KITCHEN-002"],
    };
    const html = ano01Html(data);
    expect(html).toContain("Produits manquants");
    expect(html).toContain("SKU-KITCHEN-001");
    expect(html).toContain("SKU-KITCHEN-002");
  });

  it("single SKU: html contains 'Produit manquant' (singular)", () => {
    const html = ano01Html(baseData);
    expect(html).toContain("Produit manquant");
    expect(html).not.toContain("Produits manquants");
  });

  it("skuLabel appears in html when provided with single SKU", () => {
    const data = {
      ...baseData,
      skuLabel: "Plan de travail chene massif 3m",
    };
    const html = ano01Html(data);
    expect(html).toContain("Plan de travail chene massif 3m");
  });

  it("promisedDeliveryDate null shows 'non renseignee'", () => {
    const data = { ...baseData, promisedDeliveryDate: null };
    const html = ano01Html(data);
    expect(html).toContain("non renseignée");
  });
});
