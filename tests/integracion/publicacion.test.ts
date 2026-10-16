// Fase 4 contra MySQL real, con Google simulado (sin red).
// Aceptación: un video aprobado queda programado en YouTube y con ficha en Drive.

import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDB } from "mysql-memory-server";
import { crearPrisma, type Db } from "@/lib/db";
import { cifrar } from "@/lib/cifrado";
import { guardarCanal, validarConfigCanal } from "@/lib/canales";
import { crearOActualizarUsuario } from "@/lib/usuarios";
import { ALCANCES_GOOGLE } from "@/lib/google/cliente";
import { AccesoDenegado, cambiarEstadoVideo, cargarUsuario, type UsuarioSesion } from "@/server/acceso";
import { registrarPublicacion } from "@/server/metricas";
import {
  estadoParaProgramar,
  generarFichaEnDrive,
  guardarFicha,
  marcarPublicado,
  programarEnYoutube,
  registrarTiktokPublicado,
} from "@/server/publicacion";

let mysql: Awaited<ReturnType<typeof createDB>>;
let db: Db;
let A: string;
let videoId: string;
const u = {} as Record<"adminA" | "prodA" | "revA" | "prodB", UsuarioSesion>;
const CLAVE = Buffer.alloc(32, 5).toString("base64");
const AHORA = new Date("2026-10-28T12:00:00Z");
const PUBLICACION = new Date("2026-11-04T17:00:00Z"); // 12:00 en Bogotá

const llamadas: { metodo: string; url: string; cuerpo: string }[] = [];
let privacidad: "private" | "public" = "private";
const fetchFalso: typeof fetch = async (entrada, init) => {
  const url = String(entrada);
  const metodo = init?.method ?? "GET";
  const cuerpo = typeof init?.body === "string" ? init.body : String(init?.body ?? "");
  llamadas.push({ metodo, url, cuerpo });
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
  if (url.startsWith("https://oauth2.googleapis.com/token")) return json({ access_token: "at", scope: "", expires_in: 3600 });
  if (url.startsWith("https://www.googleapis.com/drive/v3/files") && metodo === "POST") {
    const nombre = JSON.parse(cuerpo).name as string;
    return json({ id: `carpeta-${llamadas.length}`, webViewLink: `https://drive.google.com/drive/folders/${encodeURIComponent(nombre)}` });
  }
  if (url.startsWith("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")) {
    return json({ id: "doc-1", webViewLink: "https://docs.google.com/document/d/doc-1/edit" });
  }
  if (url.startsWith("https://www.googleapis.com/upload/drive/v3/files/doc-1")) {
    return json({ id: "doc-1", webViewLink: "https://docs.google.com/document/d/doc-1/edit" });
  }
  if (url.startsWith("https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=")) {
    return json({
      items: [
        {
          id: "AAAAAAAAAA1",
          snippet: { title: "Título viejo", description: "", categoryId: "27", channelId: "UC1", defaultAudioLanguage: "es" },
          status: { privacyStatus: privacidad, license: "youtube", embeddable: true, publicStatsViewable: true, selfDeclaredMadeForKids: false },
        },
      ],
    });
  }
  if (url === "https://www.googleapis.com/youtube/v3/videos?part=snippet,status" && metodo === "PUT") {
    const b = JSON.parse(cuerpo);
    return json({ ...b, status: { ...b.status } });
  }
  return new Response(JSON.stringify({ error: { message: `no simulado ${metodo} ${url}` } }), { status: 404 });
};
const deps = { fetch: fetchFalso, oauth: { clientId: "c", clientSecret: "s", redirectUri: "https://p.test/cb" }, ahora: AHORA };

const fichaValida = {
  youtube: {
    titulo: "Tu banco te cobra $37 al mes",
    descripcion: "Gancho\n\nFuentes:\n- https://fuente.test/a\n\nAviso legal.",
    etiquetas: ["P1", "bancos"],
    comentarioFijado: "¿Cuánto pagas tú?",
  },
  tiktok: { descripcion: "Tu banco te cobra $37 al mes", hashtags: ["#MiCanal", "#bancos", "#dinero", "#finanzas"], comentarioFijado: "Video completo en YouTube: enlace en la bio." },
};

beforeAll(async () => {
  process.env.INTEGRACIONES_CLAVE = CLAVE;
  mysql = await createDB({ version: "8.4.x", dbName: "panel_pub", xEnabled: "OFF" });
  const url = `mysql://${mysql.username}@127.0.0.1:${mysql.port}/${mysql.dbName}`;
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
  db = crearPrisma(url);
  const cfg = (slug: string) =>
    validarConfigCanal({
      slug,
      nombre: slug,
      zonaHoraria: "America/Bogota",
      horaPublicacion: "12:00",
      diasPublicacion: ["mie"],
      colorAcento: "#123456",
      pilares: ["P1"],
      reglas: { piezasPorVideo: { largo: 1, tiktok: 2, shorts: 0 }, ficha: { hashtagsFijos: ["#MiCanal"], avisoLegal: "Aviso legal." } },
    });
  A = (await guardarCanal(db, cfg("canal-a"))).id;
  await guardarCanal(db, cfg("canal-b"));
  for (const [k, email, canal, rol] of [
    ["adminA", "admin@a.test", "canal-a", "admin"],
    ["prodA", "prod@a.test", "canal-a", "productor"],
    ["revA", "rev@a.test", "canal-a", "revisor"],
    ["prodB", "prod@b.test", "canal-b", "productor"],
  ] as const) {
    const c = await crearOActualizarUsuario(db, { email, canal, rol });
    u[k] = (await cargarUsuario(db, c.id))!;
  }
  // Un video que ya pasó por el flujo hasta revisión.
  const v = await db.video.create({
    data: { canalId: A, titulo: "Tu banco te cobra $37 al mes", estado: "revision", scoreGancho: 80, fuentesOk: true, fechaPublicacion: PUBLICACION },
  });
  videoId = v.id;
  await db.integracion.create({
    data: {
      canalId: A,
      proveedor: "google",
      refreshTokenCifrado: cifrar("rt", CLAVE),
      alcances: ALCANCES_GOOGLE.join(" "),
      youtubeCanalId: "UC1",
    },
  });
});

afterAll(async () => {
  await db?.$disconnect();
  await mysql?.stop();
});

describe("ficha y Drive", () => {
  it("la ficha de TikTok no admite enlaces y se guarda validada", async () => {
    await expect(
      guardarFicha(db, u.prodA, A, videoId, { ...fichaValida, tiktok: { ...fichaValida.tiktok, descripcion: "mira youtube.com/x" } }),
    ).rejects.toThrow(/solo en la bio/);
    await expect(guardarFicha(db, u.prodB, A, videoId, fichaValida)).rejects.toBeInstanceOf(AccesoDenegado);
    const r = await guardarFicha(db, u.prodA, A, videoId, fichaValida);
    expect(r.errores).toEqual([]);
  });

  it("crea la carpeta raíz, la del video y la ficha; la segunda vez solo actualiza el documento", async () => {
    llamadas.length = 0;
    const r = await generarFichaEnDrive(db, u.prodA, A, videoId, deps);
    expect(r.fichaUrl).toBe("https://docs.google.com/document/d/doc-1/edit");
    const creaciones = llamadas.filter((l) => l.url.startsWith("https://www.googleapis.com/drive/v3/files"));
    expect(creaciones.map((l) => JSON.parse(l.cuerpo).name)).toEqual(["canal-a · Panel", "2026-11-04 · Tu banco te cobra $37 al mes"]);
    const multipart = llamadas.find((l) => l.url.includes("uploadType=multipart"))!;
    expect(multipart.cuerpo).toContain("application/vnd.google-apps.document");
    expect(multipart.cuerpo).toContain("PARTE 2/2");
    expect(multipart.cuerpo).not.toContain("<script");

    llamadas.length = 0;
    await generarFichaEnDrive(db, u.prodA, A, videoId, deps);
    expect(llamadas.filter((l) => l.metodo === "POST" && l.url.includes("/drive/"))).toHaveLength(0);
    expect(llamadas.some((l) => l.metodo === "PATCH" && l.url.includes("/files/doc-1"))).toBe(true);
    expect(await db.actividad.count({ where: { canalId: A, videoId, accion: "drive_ficha" } })).toBe(2);
  });
});

describe("programar en YouTube", () => {
  it("no se puede sin aprobación firmada por revisor o admin", async () => {
    await registrarPublicacion(db, u.prodA, A, { videoId, enlace: "https://youtu.be/AAAAAAAAAA1" });
    const antes = await estadoParaProgramar(db, u.adminA, A, videoId, null, AHORA);
    expect(antes.motivos.join(" ")).toMatch(/Aprobado/);
    await expect(programarEnYoutube(db, u.adminA, A, videoId, { confirmo: true, fechaLocal: null }, deps)).rejects.toThrow(/Aprobado/);

    // Una firma de alguien sin rol de aprobación no vale (p. ej. datos alterados).
    await db.video.update({ where: { id: videoId }, data: { estado: "aprobado", aprobadoPorId: u.prodA.id, aprobadoEn: new Date() } });
    expect((await estadoParaProgramar(db, u.adminA, A, videoId, null, AHORA)).motivos.join(" ")).toMatch(/firma/);
    await db.video.update({ where: { id: videoId }, data: { estado: "revision", aprobadoPorId: null, aprobadoEn: null } });

    await cambiarEstadoVideo(db, u.revA, videoId, "aprobado");
    expect((await estadoParaProgramar(db, u.adminA, A, videoId, null, AHORA)).motivos).toEqual([]);
  });

  it("exige confirmación explícita y rol de admin", async () => {
    await expect(programarEnYoutube(db, u.adminA, A, videoId, { confirmo: false, fechaLocal: null }, deps)).rejects.toThrow(/confirmación/);
    await expect(programarEnYoutube(db, u.prodA, A, videoId, { confirmo: true, fechaLocal: null }, deps)).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(programarEnYoutube(db, u.revA, A, videoId, { confirmo: true, fechaLocal: null }, deps)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it("no programa un video que ya es público", async () => {
    privacidad = "public";
    await expect(programarEnYoutube(db, u.adminA, A, videoId, { confirmo: true, fechaLocal: null }, deps)).rejects.toThrow(/privado/);
    privacidad = "private";
  });

  it("programa con publishAt a las 12:00 de Bogotá conservando los campos del video", async () => {
    llamadas.length = 0;
    const r = await programarEnYoutube(db, u.adminA, A, videoId, { confirmo: true, fechaLocal: null }, deps);
    expect(r.publishAt.toISOString()).toBe("2026-11-04T17:00:00.000Z");

    const put = llamadas.find((l) => l.metodo === "PUT")!;
    const cuerpo = JSON.parse(put.cuerpo);
    expect(cuerpo.snippet).toMatchObject({ title: fichaValida.youtube.titulo, categoryId: "27", channelId: "UC1", defaultAudioLanguage: "es", tags: ["P1", "bancos"] });
    expect(cuerpo.status).toEqual({
      privacyStatus: "private",
      publishAt: "2026-11-04T17:00:00.000Z",
      license: "youtube",
      embeddable: true,
      publicStatsViewable: true,
    });

    const v = await db.video.findUniqueOrThrow({ where: { id: videoId } });
    expect(v.estado).toBe("programado");
    expect(v.youtubeProgramadoPara?.toISOString()).toBe("2026-11-04T17:00:00.000Z");
    expect(v.fichaDriveUrl).toBe("https://docs.google.com/document/d/doc-1/edit");
    const acciones = (await db.actividad.findMany({ where: { canalId: A, videoId }, orderBy: { creadoEn: "asc" } })).map((a) => a.accion);
    expect(acciones).toEqual(expect.arrayContaining(["estado_cambiado", "youtube_programado", "aviso_equipo"]));
  });

  it("la fecha alternativa también se publica a la hora del canal", async () => {
    const { publishAt } = await estadoParaProgramar(db, u.adminA, A, videoId, "2026-11-06", AHORA);
    expect(publishAt?.toISOString()).toBe("2026-11-06T17:00:00.000Z");
  });
});

describe("TikTok guiado y publicado", () => {
  it("registra cada parte con confirmación, solo con el video aprobado", async () => {
    const otro = await db.video.create({ data: { canalId: A, titulo: "Sin aprobar" } });
    await expect(
      registrarTiktokPublicado(db, u.prodA, A, otro.id, { parte: 1, enlace: "https://www.tiktok.com/@a/video/7312345678901234561", confirmo: true }),
    ).rejects.toThrow(/aprobado/);
    await expect(
      registrarTiktokPublicado(db, u.prodA, A, videoId, { parte: 1, enlace: "https://www.tiktok.com/@a/video/7312345678901234561", confirmo: false }),
    ).rejects.toThrow(/confirmación/);
    await expect(
      registrarTiktokPublicado(db, u.prodA, A, videoId, { parte: 3, enlace: "https://www.tiktok.com/@a/video/7312345678901234561", confirmo: true }),
    ).rejects.toThrow(/1 a 2/);
    await expect(
      registrarTiktokPublicado(db, u.prodA, A, videoId, { parte: 1, enlace: "https://youtu.be/BBBBBBBBBB2", confirmo: true }),
    ).rejects.toThrow(/TikTok/);

    await registrarTiktokPublicado(db, u.prodA, A, videoId, { parte: 1, enlace: "https://www.tiktok.com/@a/video/7312345678901234561", confirmo: true });
    await registrarTiktokPublicado(db, u.prodA, A, videoId, { parte: 2, enlace: "https://www.tiktok.com/@a/video/7312345678901234562", confirmo: true });
    expect(await db.publicacion.count({ where: { canalId: A, videoId, plataforma: "tiktok", publicada: { not: null } } })).toBe(2);
    expect(await db.actividad.count({ where: { canalId: A, videoId, accion: "tiktok_publicado" } })).toBe(2);
  });

  it("marcar publicado exige confirmación, admin y que haya llegado la hora", async () => {
    await expect(marcarPublicado(db, u.adminA, A, videoId, { confirmo: true }, AHORA)).rejects.toThrow(/hora programada/);
    await expect(marcarPublicado(db, u.prodA, A, videoId, { confirmo: true }, new Date("2026-11-05T00:00:00Z"))).rejects.toBeInstanceOf(AccesoDenegado);
    await marcarPublicado(db, u.adminA, A, videoId, { confirmo: true }, new Date("2026-11-05T00:00:00Z"));
    expect((await db.video.findUniqueOrThrow({ where: { id: videoId } })).estado).toBe("publicado");
    const yt = await db.publicacion.findFirstOrThrow({ where: { canalId: A, videoId, plataforma: "youtube" } });
    expect(yt.publicada?.toISOString()).toBe("2026-11-04T17:00:00.000Z");
  });
});
