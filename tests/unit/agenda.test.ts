import { describe, expect, it } from "vitest";
import { parsearAgenda, parsearFecha } from "@/lib/agenda/parsear";

describe("parsearFecha", () => {
  it("lee formatos habituales", () => {
    expect(parsearFecha("2026-10-19")).toBe("2026-10-19");
    expect(parsearFecha("19/10/2026")).toBe("2026-10-19");
    expect(parsearFecha("Lunes 19 de octubre de 2026")).toBe("2026-10-19");
    expect(parsearFecha("mié 21 oct", 2026)).toBe("2026-10-21");
    expect(parsearFecha("**vie 23 de octubre**", 2026)).toBe("2026-10-23");
    expect(parsearFecha("Jue 15-oct", 2026)).toBe("2026-10-15");
    expect(parsearFecha("Lun 2-nov", 2026)).toBe("2026-11-02");
  });

  it("no inventa el año ni acepta fechas imposibles", () => {
    expect(parsearFecha("mié 21 oct")).toBeNull();
    expect(parsearFecha("31/02/2026")).toBeNull();
    expect(parsearFecha("pronto")).toBeNull();
  });
});

describe("parsearAgenda", () => {
  it("lee una tabla Markdown", () => {
    const md = [
      "# Agenda",
      "",
      "| # | Fecha | Título | Pilar | Gancho |",
      "|---|-------|--------|-------|--------|",
      "| 1 | lun 19 oct 2026 | **Primer video** | Pilar uno | Una escena |",
      "| 2 | 21/10/2026 | Segundo video | — | |",
      "| 3 | por definir | Tercer video | Pilar uno | |",
    ].join("\n");
    const { entradas, avisos } = parsearAgenda(md);
    expect(entradas).toEqual([
      { fecha: "2026-10-19", titulo: "Primer video", pilar: "Pilar uno", gancho: "Una escena", notas: null },
      { fecha: "2026-10-21", titulo: "Segundo video", pilar: null, gancho: null, notas: null },
      { fecha: null, titulo: "Tercer video", pilar: "Pilar uno", gancho: null, notas: null },
    ]);
    expect(avisos.some((a) => a.includes("por definir"))).toBe(true);
  });

  it("lee secciones por video", () => {
    const md = [
      "## Video 1 · El banco gana siempre",
      "- **Fecha:** 2026-10-19",
      "- **Pilar:** Pilar dos",
      "- **Gancho:** Abres la app y ves el saldo",
      "",
      "## Video 2: Quién cobra la comisión",
      "Fecha: 21 de octubre de 2026",
      "",
      "## Notas generales",
      "Fecha: 2026-12-01",
    ].join("\n");
    const { entradas } = parsearAgenda(md);
    expect(entradas).toHaveLength(2);
    expect(entradas[0]).toMatchObject({ titulo: "El banco gana siempre", fecha: "2026-10-19", pilar: "Pilar dos" });
    expect(entradas[1]).toMatchObject({ titulo: "Quién cobra la comisión", fecha: "2026-10-21" });
  });

  it("lee la columna de notas", () => {
    const md = ["| Fecha | Video | Notas |", "|---|---|---|", "| Lun 23-nov | Un video | Fecha clave el 27-nov |"].join("\n");
    expect(parsearAgenda(md, { anioPorDefecto: 2026 }).entradas[0]).toMatchObject({
      fecha: "2026-11-23",
      titulo: "Un video",
      notas: "Fecha clave el 27-nov",
    });
  });

  it("avisa si no encuentra videos", () => {
    const { entradas, avisos } = parsearAgenda("texto sin agenda");
    expect(entradas).toHaveLength(0);
    expect(avisos[0]).toMatch(/No se encontraron videos/);
  });
});
