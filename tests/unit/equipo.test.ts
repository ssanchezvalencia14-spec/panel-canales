import { describe, expect, it } from "vitest";
import { rolParaCanalNuevo } from "@/lib/dominio/equipo";

describe("rol del equipo en un canal nuevo", () => {
  it("toma el rol que la persona tiene en más canales", () => {
    expect(rolParaCanalNuevo(["admin", "admin", "productor"])).toBe("admin");
    expect(rolParaCanalNuevo(["productor", "productor", "admin"])).toBe("productor");
  });

  it("ante un empate elige el de menos permisos", () => {
    expect(rolParaCanalNuevo(["admin", "productor"])).toBe("productor");
    expect(rolParaCanalNuevo(["revisor", "lector"])).toBe("lector");
  });

  it("sin roles no da acceso", () => {
    expect(rolParaCanalNuevo([])).toBeNull();
  });
});
