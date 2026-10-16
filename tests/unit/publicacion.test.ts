import { describe, expect, it } from "vitest";
import { borradorFicha, configFicha, htmlFicha, normalizarHashtag, revisarFicha, tieneEnlace, textosTiktok } from "@/lib/publicacion/ficha";
import { motivosParaNoProgramar } from "@/lib/publicacion/reglas";
import { ALCANCE, tieneAlcance } from "@/lib/google/cliente";

const reglas = {
  ficha: {
    avisoLegal: "Aviso legal X.",
    etiquetaIA: "Hecho con IA.",
    hashtagsFijos: ["MiCanal", "#Serie"],
    cierreTiktok: "Video completo en YouTube: enlace en la bio.",
  },
};
const fuentes = [{ afirmacion: "37 dólares", url: "https://fuente.test/a" }];

describe("ficha de publicación", () => {
  const config = configFicha(reglas);

  it("arma el borrador con fuentes, aviso, etiqueta de IA y hashtags fijos", () => {
    const f = borradorFicha({ titulo: "Título", gancho: "Gancho", pilar: "P1" }, config, fuentes);
    expect(f.youtube.descripcion).toBe("Gancho\n\nFuentes:\n- https://fuente.test/a\n\nAviso legal X.\nHecho con IA.");
    expect(f.youtube.etiquetas).toEqual(["P1"]);
    expect(f.tiktok.hashtags).toEqual(["#MiCanal", "#Serie"]);
    expect(f.tiktok.comentarioFijado).toBe("Video completo en YouTube: enlace en la bio.");
  });

  it("en TikTok rechaza cualquier enlace en descripción o comentario", () => {
    expect(tieneEnlace("mira https://youtu.be/x")).toBe(true);
    expect(tieneEnlace("en www.canal.co")).toBe(true);
    expect(tieneEnlace("visita canal.com/video")).toBe(true);
    expect(tieneEnlace("enlace en la bio")).toBe(false);
    const f = borradorFicha({ titulo: "T", gancho: null, pilar: null }, config, []);
    const r = revisarFicha({ ...f, tiktok: { ...f.tiktok, comentarioFijado: "Míralo en youtube.com/watch" } }, config, 60, []);
    expect(r.errores.join(" ")).toMatch(/solo en la bio/);
  });

  it("avisa lo recomendable sin bloquear", () => {
    const f = borradorFicha({ titulo: "T", gancho: null, pilar: null }, config, fuentes);
    const r = revisarFicha({ ...f, youtube: { ...f.youtube, descripcion: "corta" } }, config, 60, fuentes);
    expect(r.errores).toEqual([]);
    expect(r.avisos.join(" ")).toMatch(/aviso legal/);
    expect(r.avisos.join(" ")).toMatch(/fuente https:\/\/fuente\.test\/a/);
    expect(r.avisos.join(" ")).toMatch(/4 o 5 hashtags/);
    expect(revisarFicha({ ...f, youtube: { ...f.youtube, titulo: "x".repeat(61) } }, config, 60, []).errores[0]).toMatch(/60/);
  });

  it("textos por parte de TikTok y HTML escapado", () => {
    const f = borradorFicha({ titulo: "Cómo <gana>", gancho: null, pilar: null }, config, []);
    const partes = textosTiktok(f, 4);
    expect(partes).toHaveLength(4);
    expect(partes[2].descripcion.startsWith("PARTE 3/4 · Cómo <gana>")).toBe(true);
    expect(partes[0].descripcion).toContain("#MiCanal #Serie");
    const html = htmlFicha({ canal: "C", video: "Cómo <gana>", publicacion: null, ficha: f, config, partesTiktok: 4, enlaceYoutube: null, archivos: [] });
    expect(html).toContain("Cómo &lt;gana&gt;");
    expect(html).not.toContain("<gana>");
    expect(normalizarHashtag(" ##mi canal ")).toBe("#micanal");
  });
});

describe("condiciones para programar en YouTube", () => {
  const ok = {
    estado: "aprobado",
    aprobadoEn: new Date(),
    rolAprobador: "revisor" as const,
    fichaEnDrive: true,
    idYoutube: "AAAAAAAAAA1",
    publishAt: new Date("2026-11-04T17:00:00Z"),
    ahora: new Date("2026-11-01T00:00:00Z"),
  };
  it("todo en regla", () => expect(motivosParaNoProgramar(ok)).toEqual([]));
  it("exige estado aprobado, firma de revisor o admin, ficha, video y fecha futura", () => {
    expect(motivosParaNoProgramar({ ...ok, estado: "revision" })[0]).toMatch(/Aprobado/);
    expect(motivosParaNoProgramar({ ...ok, rolAprobador: "productor" })[0]).toMatch(/firma/);
    expect(motivosParaNoProgramar({ ...ok, rolAprobador: "superadmin" })).toEqual([]);
    expect(motivosParaNoProgramar({ ...ok, aprobadoEn: null })[0]).toMatch(/firma/);
    expect(motivosParaNoProgramar({ ...ok, fichaEnDrive: false })[0]).toMatch(/Drive/);
    expect(motivosParaNoProgramar({ ...ok, idYoutube: null })[0]).toMatch(/YouTube/);
    expect(motivosParaNoProgramar({ ...ok, publishAt: new Date("2026-11-01T00:10:00Z") })[0]).toMatch(/futuro/);
  });
});

describe("permisos de Google", () => {
  it("el permiso completo de YouTube vale como lectura", () => {
    expect(tieneAlcance(`${ALCANCE.youtube} ${ALCANCE.drive}`, ALCANCE.drive)).toBe(true);
    expect(tieneAlcance(ALCANCE.youtube, "https://www.googleapis.com/auth/youtube.readonly")).toBe(true);
    expect(tieneAlcance("https://www.googleapis.com/auth/youtube.readonly", ALCANCE.youtube)).toBe(false);
  });
});
