import { describe, expect, it } from "vitest";
import { fechaLocal, fechaLocalAUtc, offsetMinutos } from "@/lib/dominio/fechas";

describe("fechas por zona horaria", () => {
  it("Bogotá (UTC-5, sin horario de verano)", () => {
    expect(fechaLocalAUtc("2026-10-19", "12:00", "America/Bogota").toISOString()).toBe("2026-10-19T17:00:00.000Z");
    expect(offsetMinutos("America/Bogota", new Date("2026-07-01T00:00:00Z"))).toBe(-300);
  });

  it("respeta el horario de verano", () => {
    expect(fechaLocalAUtc("2026-07-01", "12:00", "Europe/Madrid").toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(fechaLocalAUtc("2026-01-15", "12:00", "Europe/Madrid").toISOString()).toBe("2026-01-15T11:00:00.000Z");
  });

  it("devuelve la fecha local del instante", () => {
    expect(fechaLocal(new Date("2026-10-20T03:00:00Z"), "America/Bogota")).toBe("2026-10-19");
  });

  it("rechaza formatos inválidos", () => {
    expect(() => fechaLocalAUtc("19/10/2026", "12:00", "America/Bogota")).toThrow();
    expect(() => fechaLocalAUtc("2026-10-19", "25:00", "America/Bogota")).toThrow();
  });
});
