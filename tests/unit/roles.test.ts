import { describe, expect, it } from "vitest";
import { canalesVisibles, puede, rolEnCanal, type UsuarioConMembresias } from "@/lib/dominio/roles";

const usuario = (membresias: UsuarioConMembresias["membresias"], esSuperadmin = false) => ({
  esSuperadmin,
  membresias,
});

describe("roles por canal", () => {
  const ana = usuario([
    { canalId: "A", rol: "productor" },
    { canalId: "B", rol: "lector" },
  ]);

  it("el rol depende del canal", () => {
    expect(rolEnCanal(ana, "A")).toBe("productor");
    expect(rolEnCanal(ana, "B")).toBe("lector");
    expect(rolEnCanal(ana, "C")).toBeNull();
  });

  it("sin membresía no hay ningún permiso", () => {
    expect(puede(ana, "C", "ver")).toBe(false);
  });

  it("matriz de permisos", () => {
    const casos = [
      ["admin", { ver: true, editar_video: true, aprobar: true, publicar: true, gestionar_miembros: true }],
      ["productor", { ver: true, editar_video: true, aprobar: false, publicar: false, gestionar_miembros: false }],
      ["revisor", { ver: true, editar_video: false, aprobar: true, publicar: false, gestionar_miembros: false }],
      ["lector", { ver: true, editar_video: false, aprobar: false, publicar: false, gestionar_miembros: false }],
    ] as const;
    for (const [rol, esperado] of casos) {
      const u = usuario([{ canalId: "A", rol }]);
      for (const [accion, valor] of Object.entries(esperado)) {
        expect(puede(u, "A", accion as never), `${rol} → ${accion}`).toBe(valor);
      }
    }
  });

  it("el superadmin puede todo en cualquier canal y ve toda la red", () => {
    const sa = usuario([], true);
    expect(rolEnCanal(sa, "Z")).toBe("superadmin");
    expect(puede(sa, "Z", "publicar")).toBe(true);
    expect(canalesVisibles(sa)).toBe("todos");
  });

  it("los demás solo ven sus canales", () => {
    expect(canalesVisibles(ana)).toEqual(["A", "B"]);
  });
});
