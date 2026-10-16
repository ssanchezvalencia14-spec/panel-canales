import { describe, expect, it } from "vitest";
import { decidirAcceso, requisitoDeRuta } from "@/lib/dominio/rutas";

describe("reglas de acceso por ruta (proxy)", () => {
  it("clasifica las rutas", () => {
    expect(requisitoDeRuta("/login")).toEqual({ tipo: "publica" });
    expect(requisitoDeRuta("/login/revisa-tu-correo")).toEqual({ tipo: "publica" });
    expect(requisitoDeRuta("/api/auth/callback/nodemailer")).toEqual({ tipo: "publica" });
    expect(requisitoDeRuta("/")).toEqual({ tipo: "sesion" });
    expect(requisitoDeRuta("/canales/nuevo")).toEqual({ tipo: "superadmin" });
    expect(requisitoDeRuta("/c/canal-a")).toEqual({ tipo: "canal", slug: "canal-a" });
    expect(requisitoDeRuta("/c/canal-a/equipo")).toEqual({ tipo: "canal", slug: "canal-a" });
    expect(requisitoDeRuta("/loginx")).toEqual({ tipo: "sesion" });
  });

  const miembroA = { esSuperadmin: false, slugs: ["canal-a"] };
  const superadmin = { esSuperadmin: true, slugs: [] };

  it("sin sesión, todo lo privado va al login", () => {
    expect(decidirAcceso({ tipo: "sesion" }, null)).toBe("login");
    expect(decidirAcceso({ tipo: "canal", slug: "canal-a" }, null)).toBe("login");
    expect(decidirAcceso({ tipo: "publica" }, null)).toBe("permitir");
  });

  it("solo los miembros entran a su canal", () => {
    expect(decidirAcceso({ tipo: "canal", slug: "canal-a" }, miembroA)).toBe("permitir");
    expect(decidirAcceso({ tipo: "canal", slug: "canal-b" }, miembroA)).toBe("denegar");
    expect(decidirAcceso({ tipo: "canal", slug: "canal-b" }, superadmin)).toBe("permitir");
  });

  it("crear canales es solo del superadmin", () => {
    expect(decidirAcceso({ tipo: "superadmin" }, miembroA)).toBe("denegar");
    expect(decidirAcceso({ tipo: "superadmin" }, superadmin)).toBe("permitir");
  });
});
