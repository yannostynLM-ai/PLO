import { ano02Subject, ano02Html, ano02Text } from "./ano02.template.js";

const baseData = {
  projectId: "PRJ-2026-042",
  customerId: "CUST-77310",
  orderId: "ORD-10234",
  erpRef: "ERP-88456",
  promisedDeliveryDate: new Date("2026-04-02T06:00:00Z"),
};

describe("ano02 — Ecart picking avant depart camion", () => {
  it("subject contains BLOQUER and customerId", () => {
    const subject = ano02Subject(baseData);
    expect(subject).toContain("BLOQUER");
    expect(subject).toContain("CUST-77310");
  });

  it("html contains ANO-02 and blocking banner with stop sign", () => {
    const html = ano02Html(baseData);
    expect(html).toContain("ANO-02");
    expect(html).toContain("\u26D4");
    expect(html).toContain("BLOQUER LE CHARGEMENT");
  });

  it("html includes customerId", () => {
    const html = ano02Html(baseData);
    expect(html).toContain("CUST-77310");
  });

  it("discrepancyDetail appears in html when provided", () => {
    const data = {
      ...baseData,
      discrepancyDetail: "3 colis attendus, 1 seul scanne",
    };
    const html = ano02Html(data);
    expect(html).toContain("3 colis attendus, 1 seul scanne");
    expect(html).toContain("Détail de l'écart");
  });

  it("discrepancyDetail row absent when not provided", () => {
    const html = ano02Html(baseData);
    expect(html).not.toContain("Détail de l'écart");
  });

  it("text contains BLOQUER LE CHARGEMENT", () => {
    const text = ano02Text(baseData);
    expect(text).toContain("BLOQUER LE CHARGEMENT");
  });
});
