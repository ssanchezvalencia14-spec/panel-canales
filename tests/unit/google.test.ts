import { describe, expect, it } from "vitest";
import { firmarEstado, verificarEstado } from "@/lib/google/estado";
import { ALCANCE, ALCANCES_GOOGLE, conexionDeAlcance, urlDeAutorizacion } from "@/lib/google/cliente";
import { eventosDeseados } from "@/server/sincronizacion";
import { emparejar, mismoTitulo } from "@/lib/metricas/emparejar";

const S = "secreto-de-prueba-suficientemente-largo";

describe("state de OAuth", () => {
  const e = { canalId: "c1", userId: "u1", vence: 2_000 };
  it("verifica la firma y el vencimiento", () => {
    const s = firmarEstado(e, S);
    expect(verificarEstado(s, 1_000, S)).toEqual(e);
    expect(verificarEstado(s, 3_000, S)).toBeNull();
    expect(verificarEstado(s, 1_000, "otro-secreto")).toBeNull();
    const [datos] = s.split(".");
    const otro = Buffer.from(JSON.stringify({ ...e, canalId: "c2" })).toString("base64url");
    expect(verificarEstado(s.replace(datos, otro), 1_000, S)).toBeNull();
    expect(verificarEstado("basura", 1_000, S)).toBeNull();
  });

  it("pide acceso sin conexión (refresh token) y solo los permisos necesarios", () => {
    const u = new URL(urlDeAutorizacion({ clientId: "id", clientSecret: "x", redirectUri: "https://p.test/cb" }, "st"));
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("scope")!.split(" ")).toEqual([ALCANCE.youtube, ALCANCE.analytics, ALCANCE.calendario]);
    expect(u.searchParams.get("include_granted_scopes")).toBe("false");
    expect(u.searchParams.get("state")).toBe("st");
  });

  it("Drive va en una autorización aparte: Google no deja pedirlo junto con YouTube", () => {
    const cfg = { clientId: "id", clientSecret: "x", redirectUri: "https://p.test/cb" };
    const drive = new URL(urlDeAutorizacion(cfg, "st", "google_drive")).searchParams.get("scope")!.split(" ");
    const yt = new URL(urlDeAutorizacion(cfg, "st")).searchParams.get("scope")!.split(" ");
    expect(drive).toEqual([ALCANCE.drive]);
    expect(yt).not.toContain(ALCANCE.drive);
    // Entre las dos conexiones se cubren todos los permisos del panel.
    expect([...yt, ...drive].sort()).toEqual([...ALCANCES_GOOGLE].sort());
    expect(conexionDeAlcance(ALCANCE.drive)).toBe("google_drive");
    expect(conexionDeAlcance(ALCANCE.youtube)).toBe("google");
  });
});

describe("eventos del calendario de Google", () => {
  it("publicación con hora y producción de día completo N días antes", () => {
    const [pub, prod] = eventosDeseados("v1", "Uno", new Date("2026-10-21T17:00:00Z"), "America/Bogota", 3);
    expect(pub.evento.start).toEqual({ dateTime: "2026-10-21T17:00:00.000Z", timeZone: "America/Bogota" });
    expect(pub.evento.extendedProperties?.private.panelVideoId).toBe("v1");
    expect(prod.evento.start).toEqual({ date: "2026-10-18" });
    expect(prod.evento.end).toEqual({ date: "2026-10-19" });
    expect(eventosDeseados("v1", "Uno", new Date(), "America/Bogota", 0)).toHaveLength(1);
  });
});

describe("emparejar títulos", () => {
  const videos = [{ titulo: "¿Cómo gana dinero Netflix?" }, { titulo: "Cómo Jeff Bezos construyó su fortuna" }];
  it("acepta el sufijo del canal y rechaza ambigüedades", () => {
    expect(emparejar("¿Cómo gana dinero NETFLIX? | Mi canal", videos)).toBe(videos[0]);
    expect(emparejar("Netflix", videos)).toBeNull();
    expect(mismoTitulo("Corto", "Corto y algo más")).toBe(false);
    expect(emparejar("Cómo", [{ titulo: "Cómo" }, { titulo: "como" }])).toBeNull();
  });
});
