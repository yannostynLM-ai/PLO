import { ano06Subject, ano06Html, ano06Text } from "./ano06.template.js";

const baseData = {
  projectId: "PRJ-2026-118",
  customerId: "CUST-63200",
  installationId: "INST-90471",
  technicianName: "Jean-Marc Dupont",
  issueType: "Panne electrique",
  issueDescription: "Disjoncteur differentiel saute a la mise sous tension du four",
  scheduledDate: new Date("2026-03-20T09:00:00Z"),
  isBlocking: true,
};

const nonBlockingData = {
  ...baseData,
  isBlocking: false,
};

describe("ano06 — Probleme pendant installation", () => {
  it("subject includes BLOQUANT when isBlocking is true", () => {
    const subject = ano06Subject(baseData);
    expect(subject).toContain("BLOQUANT");
  });

  it("subject does NOT include BLOQUANT when isBlocking is false", () => {
    const subject = ano06Subject(nonBlockingData);
    expect(subject).not.toContain("BLOQUANT");
  });

  it("html contains ANO-06", () => {
    const html = ano06Html(nonBlockingData);
    expect(html).toContain("ANO-06");
  });

  it("html contains ANO-06/ANO-12 when isBlocking is true", () => {
    const html = ano06Html(baseData);
    expect(html).toContain("ANO-06/ANO-12");
  });

  it("blocking banner present in html when isBlocking", () => {
    const html = ano06Html(baseData);
    expect(html).toContain("INCIDENT BLOQUANT");
    expect(html).toContain("Intervention suspendue");
  });

  it("blocking banner absent in html when not isBlocking", () => {
    const html = ano06Html(nonBlockingData);
    expect(html).not.toContain("INCIDENT BLOQUANT");
  });

  it("technicianName appears in html when provided", () => {
    const html = ano06Html(baseData);
    expect(html).toContain("Jean-Marc Dupont");
    expect(html).toContain("Technicien");
  });

  it("html includes installationId when provided", () => {
    const html = ano06Html(baseData);
    expect(html).toContain("INST-90471");
  });
});
