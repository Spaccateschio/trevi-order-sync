import { describe, expect, it } from "vitest";

import {
  createLocalSupportRequest,
  filterSupportRequests,
  MOCK_SUPPORT_REQUESTS,
} from "./support-request-mock";

describe("richieste di assistenza e miglioramento dimostrative", () => {
  it("separa le proposte di miglioramento dalle richieste di assistenza", () => {
    const result = filterSupportRequests(MOCK_SUPPORT_REQUESTS, { kind: "miglioramento" });
    expect(result.map((request) => request.id)).toEqual(["DEMO-002"]);
  });

  it("filtra le richieste da lavorare senza includere quelle risolte", () => {
    const result = filterSupportRequests(MOCK_SUPPORT_REQUESTS, { status: "nuova" });
    expect(result.map((request) => request.id)).toEqual(["DEMO-001"]);
  });

  it("cerca anche per azienda e pagina indicata dall’utente", () => {
    expect(filterSupportRequests(MOCK_SUPPORT_REQUESTS, { query: "azienda dimostrativa" })).toHaveLength(1);
    expect(filterSupportRequests(MOCK_SUPPORT_REQUESTS, { query: "collaboratori" })[0]?.id).toBe("DEMO-003");
  });

  it("crea una richiesta locale nuova con pagina e schermata facoltativa", () => {
    const request = createLocalSupportRequest(
      {
        kind: "assistenza",
        title: "  Problema di esempio  ",
        details: "  Descrizione di esempio  ",
        page: "Inventario",
        screenshotName: "schermata.png",
      },
      4,
    );
    expect(request).toMatchObject({
      id: "DEMO-004",
      status: "nuova",
      title: "Problema di esempio",
      details: "Descrizione di esempio",
      page: "Inventario",
      screenshotName: "schermata.png",
    });
  });
});
