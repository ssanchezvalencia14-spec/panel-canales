import { describe, expect, it } from "vitest";
import { ganchoAprobado, objetivoGancho, puntuarGancho } from "@/lib/puntaje/gancho";
import { limitesDeCanal, revisarTitulo } from "@/lib/puntaje/titulo";

describe("puntaje de gancho", () => {
  it("un gancho concreto, dirigido, con riesgo y pregunta supera el objetivo", () => {
    const p = puntuarGancho("¿Por qué tu banco te cobra 37 dólares al mes?");
    expect(p.propiedades.especificidad.puntos).toBe(14);
    expect(p.propiedades.dirigido.puntos).toBe(20);
    expect(p.propiedades.riesgo.puntos).toBeGreaterThanOrEqual(8);
    expect(p.propiedades.curiosidad.puntos).toBe(12);
    expect(p.propiedades.brevedad.puntos).toBe(20);
    expect(p.total).toBeGreaterThanOrEqual(72);
  });

  it("un gancho genérico queda por debajo y explica qué mejorar", () => {
    const p = puntuarGancho("Hoy vamos a hablar de un tema muy interesante sobre la economía mundial y sus efectos en general");
    expect(p.total).toBeLessThan(72);
    expect(p.propiedades.dirigido.puntos).toBe(0);
    expect(p.propiedades.brevedad.puntos).toBeLessThan(20);
    expect(p.sugerencias.length).toBeGreaterThanOrEqual(3);
  });

  it("cada propiedad va de 0 a 20 y el total de 0 a 100", () => {
    for (const g of ["", "Hola", "Tú pierdes, tú pagas, tú cobras, tu deuda, tu error, tu multa, tu riesgo"]) {
      const p = puntuarGancho(g);
      expect(p.total).toBeGreaterThanOrEqual(0);
      expect(p.total).toBeLessThanOrEqual(100);
      for (const v of Object.values(p.propiedades)) expect(v.puntos).toBeLessThanOrEqual(20);
    }
  });

  it("objetivo por canal y forzado del admin", () => {
    expect(objetivoGancho({})).toBe(72);
    expect(objetivoGancho({ objetivoGancho: 80 })).toBe(80);
    expect(ganchoAprobado({ scoreGancho: 71, ganchoForzadoEn: null }, 72)).toBe(false);
    expect(ganchoAprobado({ scoreGancho: 72, ganchoForzadoEn: null }, 72)).toBe(true);
    expect(ganchoAprobado({ scoreGancho: 10, ganchoForzadoEn: new Date() }, 72)).toBe(true);
    expect(ganchoAprobado({ scoreGancho: null, ganchoForzadoEn: null }, 72)).toBe(false);
  });
});

describe("revisión de título", () => {
  it("marca sin-cifra y móvil, y largo como error", () => {
    const r = revisarTitulo("Por qué los bancos siempre ganan y cómo evitar que te sigan cobrando de más", null);
    expect(r.banderas.map((b) => b.codigo)).toEqual(["largo", "móvil", "sin-cifra"]);
    expect(r.ok).toBe(false);
  });

  it("un buen título corto con cifra pasa limpio", () => {
    const r = revisarTitulo("Tu banco te cobra $37 al mes", "COMISIÓN OCULTA");
    expect(r.banderas).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.longitud).toBe(28);
  });

  it("revisa la miniatura como pareja del título", () => {
    const r = revisarTitulo("Cómo gana dinero Netflix en 2026", "Netflix gana millones aquí");
    expect(r.banderas.map((b) => b.codigo)).toEqual(["miniatura-larga", "miniatura-repite"]);
    expect(revisarTitulo("Cosas que no sabías del dinero", null).banderas.map((b) => b.codigo)).toContain("vago");
  });

  it("los límites salen de las reglas del canal", () => {
    expect(limitesDeCanal({ tituloMax: 70 }).maximo).toBe(70);
    const r = revisarTitulo("x".repeat(65), null, limitesDeCanal({ tituloMax: 70 }));
    expect(r.ok).toBe(true);
  });
});
