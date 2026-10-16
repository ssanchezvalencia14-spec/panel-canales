import { describe, expect, it } from "vitest";
import { efectoAprobacion, validarTransicion, type ContextoTransicion } from "@/lib/dominio/estados";

const ctx = (c: Partial<ContextoTransicion>): ContextoTransicion => ({
  desde: "idea",
  hasta: "guion",
  rol: "productor",
  fuentesOk: false,
  aprobado: false,
  ...c,
});

describe("transiciones de estado", () => {
  it("avanza un paso", () => {
    expect(validarTransicion(ctx({})).ok).toBe(true);
  });

  it("no permite saltar estados", () => {
    const r = validarTransicion(ctx({ desde: "idea", hasta: "produccion", rol: "admin", fuentesOk: true }));
    expect(r.ok).toBe(false);
  });

  it("el lector no puede mover videos", () => {
    expect(validarTransicion(ctx({ rol: "lector" })).ok).toBe(false);
    expect(validarTransicion(ctx({ rol: null })).ok).toBe(false);
  });

  it("no pasa a producción sin fuentes verificadas", () => {
    const sin = validarTransicion(ctx({ desde: "verificacion", hasta: "produccion" }));
    expect(sin.ok).toBe(false);
    if (!sin.ok) expect(sin.motivo).toMatch(/fuente/i);
    expect(validarTransicion(ctx({ desde: "verificacion", hasta: "produccion", fuentesOk: true })).ok).toBe(true);
  });

  it("solo revisor o admin aprueban", () => {
    const base = { desde: "revision", hasta: "aprobado", fuentesOk: true } as const;
    expect(validarTransicion(ctx({ ...base, rol: "productor" })).ok).toBe(false);
    expect(validarTransicion(ctx({ ...base, rol: "revisor" })).ok).toBe(true);
    expect(validarTransicion(ctx({ ...base, rol: "admin" })).ok).toBe(true);
  });

  it("no se programa sin aprobación firmada, ni sin permiso de publicar", () => {
    const base = { desde: "aprobado", hasta: "programado", fuentesOk: true } as const;
    expect(validarTransicion(ctx({ ...base, rol: "admin", aprobado: false })).ok).toBe(false);
    expect(validarTransicion(ctx({ ...base, rol: "revisor", aprobado: true })).ok).toBe(false);
    expect(validarTransicion(ctx({ ...base, rol: "admin", aprobado: true })).ok).toBe(true);
    expect(validarTransicion(ctx({ ...base, rol: "superadmin", aprobado: true })).ok).toBe(true);
  });

  it("retroceder está permitido salvo desde publicado", () => {
    expect(validarTransicion(ctx({ desde: "revision", hasta: "guion" })).ok).toBe(true);
    expect(validarTransicion(ctx({ desde: "publicado", hasta: "programado", rol: "admin" })).ok).toBe(false);
    expect(validarTransicion(ctx({ desde: "programado", hasta: "aprobado", rol: "productor" })).ok).toBe(false);
  });

  it("la firma se crea al aprobar y se retira al volver atrás", () => {
    expect(efectoAprobacion("revision", "aprobado")).toBe("firmar");
    expect(efectoAprobacion("aprobado", "revision")).toBe("retirar");
    expect(efectoAprobacion("aprobado", "programado")).toBe("mantener");
    expect(efectoAprobacion("programado", "aprobado")).toBe("mantener");
  });
});
