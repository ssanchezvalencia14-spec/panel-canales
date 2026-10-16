import { describe, expect, it } from "vitest";
import { construirMes, diasProduccion, mesVecino, sumarDias } from "@/lib/dominio/calendario";

describe("calendario del canal", () => {
  const videos = [
    // 2026-10-21 12:00 en Bogotá = 17:00 UTC
    { id: "v1", titulo: "Uno", fechaPublicacion: new Date("2026-10-21T17:00:00Z") },
    // 2026-11-02 03:00 UTC sigue siendo 1-nov en Bogotá
    { id: "v2", titulo: "Dos", fechaPublicacion: new Date("2026-11-02T03:00:00Z") },
    { id: "v3", titulo: "Sin fecha", fechaPublicacion: null },
  ];

  it("arma semanas de lunes a domingo que cubren el mes", () => {
    const semanas = construirMes("2026-10", videos, "America/Bogota", 3);
    expect(semanas[0][0].fecha).toBe("2026-09-28"); // lunes
    expect(semanas.at(-1)!.at(-1)!.fecha).toBe("2026-11-01"); // domingo
    expect(semanas.every((s) => s.length === 7)).toBe(true);
  });

  it("marca publicación y producción N días antes, en la zona del canal", () => {
    const dias = construirMes("2026-10", videos, "America/Bogota", 3).flat();
    const de = (f: string) => dias.find((d) => d.fecha === f)!.eventos;
    expect(de("2026-10-21")).toEqual([{ tipo: "publicacion", videoId: "v1", titulo: "Uno" }]);
    expect(de("2026-10-18")).toEqual([{ tipo: "produccion", videoId: "v1", titulo: "Uno" }]);
    expect(de("2026-11-01")).toEqual([{ tipo: "publicacion", videoId: "v2", titulo: "Dos" }]);
    expect(de("2026-10-29")).toEqual([{ tipo: "produccion", videoId: "v2", titulo: "Dos" }]);
  });

  it("lee los días de producción de las reglas", () => {
    expect(diasProduccion({ diasProduccionAntes: 5 })).toBe(5);
    expect(diasProduccion({})).toBe(3);
    expect(diasProduccion(null)).toBe(3);
  });

  it("aritmética de fechas", () => {
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(mesVecino("2026-12", 1)).toBe("2027-01");
    expect(mesVecino("2026-01", -1)).toBe("2025-12");
  });
});
