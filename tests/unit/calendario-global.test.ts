import { describe, expect, it } from "vitest";
import { construirMesGlobal, textoSobre, type EntradaCanal } from "@/lib/dominio/calendario-global";

const entrada = (slug: string, zona: string, extra: Partial<EntradaCanal> = {}): EntradaCanal => ({
  canal: { slug, nombre: slug.toUpperCase(), color: "#ccf02a", zona, diasAntes: 3 },
  videos: [],
  reuniones: [],
  publicados: [],
  ...extra,
});

const todos = (semanas: ReturnType<typeof construirMesGlobal>) => semanas.flat().flatMap((d) => d.eventos.map((e) => ({ ...e, fecha: d.fecha })));

describe("calendario global", () => {
  it("junta los eventos de varios canales en una sola grilla", () => {
    const semanas = construirMesGlobal("2026-10", [
      entrada("a", "America/Bogota", { videos: [{ id: "v1", titulo: "Uno", fechaPublicacion: new Date("2026-10-21T17:00:00Z") }] }),
      entrada("b", "America/Bogota", { videos: [{ id: "v2", titulo: "Dos", fechaPublicacion: new Date("2026-10-21T17:00:00Z") }] }),
    ]);
    expect(semanas.every((s) => s.length === 7)).toBe(true);
    const dia21 = semanas.flat().find((d) => d.fecha === "2026-10-21")!;
    expect(dia21.eventos.map((e) => `${e.canalSlug}:${e.tipo}`)).toEqual(["a:publicacion", "b:publicacion"]);
    // Producción 3 días antes.
    expect(todos(semanas).filter((e) => e.tipo === "produccion").map((e) => e.fecha)).toEqual(["2026-10-18", "2026-10-18"]);
  });

  it("respeta la zona horaria de cada canal", () => {
    // 02:00 UTC del 22 es todavía el 21 en Bogotá, pero ya es el 22 en UTC.
    const v = [{ id: "v", titulo: "T", fechaPublicacion: new Date("2026-10-22T02:00:00Z") }];
    const bogota = todos(construirMesGlobal("2026-10", [entrada("a", "America/Bogota", { videos: v })])).find((e) => e.tipo === "publicacion")!;
    const utc = todos(construirMesGlobal("2026-10", [entrada("a", "UTC", { videos: v })])).find((e) => e.tipo === "publicacion")!;
    expect(bogota.fecha).toBe("2026-10-21");
    expect(utc.fecha).toBe("2026-10-22");
  });

  it("muestra los videos ya publicados en YouTube sin duplicar los que el panel ya programó", () => {
    const semanas = construirMesGlobal("2026-10", [
      entrada("a", "America/Bogota", {
        videos: [{ id: "v1", titulo: "Programado", fechaPublicacion: new Date("2026-10-15T17:00:00Z") }],
        publicados: [
          { id: "aaaaaaaaaaa", titulo: "Mismo día", publicadoEn: new Date("2026-10-15T17:05:00Z") },
          { id: "bbbbbbbbbbb", titulo: "Otro día", publicadoEn: new Date("2026-10-08T17:05:00Z") },
        ],
      }),
    ]);
    const publicados = todos(semanas).filter((e) => e.tipo === "publicado");
    expect(publicados.map((e) => e.titulo)).toEqual(["Otro día"]);
    expect(publicados[0].url).toBe("https://www.youtube.com/watch?v=bbbbbbbbbbb");
  });

  it("incluye reuniones y rechaza meses inválidos", () => {
    const semanas = construirMesGlobal("2026-10", [
      entrada("a", "America/Bogota", { reuniones: [{ id: "r", titulo: "Reunión", inicio: new Date("2026-10-20T14:00:00Z"), todoElDia: false }] }),
    ]);
    expect(todos(semanas).find((e) => e.tipo === "reunion")?.fecha).toBe("2026-10-20");
    expect(() => construirMesGlobal("2026-13", [])).toThrow();
  });

  it("elige texto legible sobre el color del canal", () => {
    expect(textoSobre("#ccf02a")).toBe("#0a1140");
    expect(textoSobre("#1d44f9")).toBe("#ffffff");
    expect(textoSobre("nope")).toBe("#ffffff");
  });
});
