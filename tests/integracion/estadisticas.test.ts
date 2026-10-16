// Fase 2 contra MySQL real: publicaciones, métricas, CSV, resultados y la
// sincronización con Google (APIs simuladas con un fetch falso).

import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDB } from "mysql-memory-server";
import { crearPrisma, type Db } from "@/lib/db";
import { cifrar } from "@/lib/cifrado";
import { guardarCanal, validarConfigCanal } from "@/lib/canales";
import { crearOActualizarUsuario } from "@/lib/usuarios";
import { importarAgenda } from "@/lib/agenda/importar";
import { AccesoDenegado, cargarUsuario, NoEncontrado, type UsuarioSesion } from "@/server/acceso";
import {
  DatoInvalido,
  estadisticasDeCanal,
  exportarEstadisticasCsv,
  guardarMetricaManual,
  importarMetricasCsv,
  integracionDeCanal,
  registrarPublicacion,
} from "@/server/metricas";
import { sincronizarCanal } from "@/server/sincronizacion";

let mysql: Awaited<ReturnType<typeof createDB>>;
let db: Db;
let A: string;
let B: string;
const u = {} as Record<"adminA" | "prodA" | "lectorA" | "prodB", UsuarioSesion>;
const CLAVE = Buffer.alloc(32, 9).toString("base64");

const config = (slug: string) =>
  validarConfigCanal({
    slug,
    nombre: slug,
    zonaHoraria: "America/Bogota",
    horaPublicacion: "12:00",
    diasPublicacion: ["lun"],
    colorAcento: "#123456",
    pilares: ["P1", "P2"],
    reglas: { diasProduccionAntes: 3 },
  });

const agenda = (pref: string) =>
  ["| Fecha | Video | Pilar |", "|---|---|---|", `| 2026-10-19 | ${pref} uno | P1 |`, `| 2026-10-21 | ${pref} dos | P2 |`].join("\n");

beforeAll(async () => {
  process.env.INTEGRACIONES_CLAVE = CLAVE;
  mysql = await createDB({ version: "8.4.x", dbName: "panel_est", xEnabled: "OFF" });
  const url = `mysql://${mysql.username}@127.0.0.1:${mysql.port}/${mysql.dbName}`;
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
  db = crearPrisma(url);
  A = (await guardarCanal(db, config("canal-a"))).id;
  B = (await guardarCanal(db, config("canal-b"))).id;
  await importarAgenda(db, "canal-a", agenda("Video A"));
  await importarAgenda(db, "canal-b", agenda("Video B"));
  for (const [k, email, canal, rol] of [
    ["adminA", "admin@a.test", "canal-a", "admin"],
    ["prodA", "prod@a.test", "canal-a", "productor"],
    ["lectorA", "lector@a.test", "canal-a", "lector"],
    ["prodB", "prod@b.test", "canal-b", "productor"],
  ] as const) {
    const creado = await crearOActualizarUsuario(db, { email, canal, rol });
    u[k] = (await cargarUsuario(db, creado.id))!;
  }
});

afterAll(async () => {
  await db?.$disconnect();
  await mysql?.stop();
});

const video = (canalId: string, titulo: string) => db.video.findFirstOrThrow({ where: { canalId, titulo } });

describe("publicaciones", () => {
  it("el productor registra enlaces; el lector y otros canales no", async () => {
    const v = await video(A, "Video A uno");
    const p = await registrarPublicacion(db, u.prodA, A, { videoId: v.id, enlace: "https://youtu.be/AAAAAAAAAA1" });
    expect(p).toMatchObject({ plataforma: "youtube", externoId: "AAAAAAAAAA1", url: "https://www.youtube.com/watch?v=AAAAAAAAAA1" });

    await expect(registrarPublicacion(db, u.lectorA, A, { videoId: v.id, enlace: "https://youtu.be/AAAAAAAAAA2" })).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(registrarPublicacion(db, u.prodB, A, { videoId: v.id, enlace: "https://youtu.be/AAAAAAAAAA2" })).rejects.toBeInstanceOf(AccesoDenegado);
    // Un video de A no se puede colgar pasando el canal B.
    await expect(registrarPublicacion(db, u.prodB, B, { videoId: v.id, enlace: "https://youtu.be/AAAAAAAAAA2" })).rejects.toBeInstanceOf(NoEncontrado);
  });

  it("no acepta enlaces irreconocibles ni repetidos en otro video", async () => {
    const dos = await video(A, "Video A dos");
    await expect(registrarPublicacion(db, u.prodA, A, { videoId: dos.id, enlace: "https://example.com" })).rejects.toBeInstanceOf(DatoInvalido);
    await expect(registrarPublicacion(db, u.prodA, A, { videoId: dos.id, enlace: "https://youtu.be/AAAAAAAAAA1" })).rejects.toThrow(/otro video/);
  });
});

describe("métricas manuales y CSV", () => {
  it("guarda una foto manual y la completa con un CSV sin pisar lo que no trae", async () => {
    const pub = await db.publicacion.findFirstOrThrow({ where: { canalId: A, externoId: "AAAAAAAAAA1" } });
    await guardarMetricaManual(db, u.prodA, A, pub.id, "2026-10-25", { vistas: 1000, retencion: 40, likes: 50 });
    await expect(guardarMetricaManual(db, u.prodA, A, pub.id, "2026-10-25", { ctr: 140 })).rejects.toThrow(/porcentaje/);
    await expect(guardarMetricaManual(db, u.lectorA, A, pub.id, "2026-10-25", { vistas: 1 })).rejects.toBeInstanceOf(AccesoDenegado);

    const csv = "Contenido,Vistas,Porcentaje de clics de las impresiones (%)\nTotal,1200,5\nAAAAAAAAAA1,1200,5.5\n";
    const r = await importarMetricasCsv(db, u.prodA, A, csv, { plataforma: "youtube", fechaPorDefecto: "2026-10-25" });
    expect(r).toMatchObject({ guardadas: 1, sinEmparejar: [] });
    const m = await db.metrica.findFirstOrThrow({ where: { publicacionId: pub.id } });
    expect(m).toMatchObject({ vistas: 1200, ctr: 5.5, retencion: 40, likes: 50, fuente: "csv" });
  });

  it("empareja por título creando la publicación de TikTok y lista lo que no encuentra", async () => {
    const csv = [
      "Video link,Title,Date,Video views,Likes",
      "https://www.tiktok.com/@a/video/7312345678901234567,Video A dos,2026-10-26,800,40",
      "https://www.tiktok.com/@a/video/7312345678901234568,Algo que no existe,2026-10-26,10,1",
      // Un video del canal B nunca se empareja desde el canal A.
      "https://www.tiktok.com/@b/video/7312345678901234569,Video B dos,2026-10-26,5,1",
    ].join("\n");
    const r = await importarMetricasCsv(db, u.prodA, A, csv, { plataforma: "tiktok", fechaPorDefecto: "2026-10-26" });
    expect(r.guardadas).toBe(1);
    expect(r.creadas).toBe(1);
    expect(r.sinEmparejar).toEqual(["Algo que no existe", "Video B dos"]);
    expect(await db.publicacion.count({ where: { canalId: B } })).toBe(0);
  });
});

describe("resultados y exportación", () => {
  it("calcula totales por video y resultados, solo con datos del canal", async () => {
    const { videos, resultados } = await estadisticasDeCanal(db, u.lectorA, A);
    expect(videos.map((v) => [v.titulo, v.total?.vistas ?? null])).toEqual([
      ["Video A uno", 1200],
      ["Video A dos", 800],
    ]);
    expect(resultados.porPilar.map((g) => g.clave)).toEqual(["P1", "P2"]);
    expect(resultados.porHora[0]).toMatchObject({ clave: "12:00", videos: 2 });
    await expect(estadisticasDeCanal(db, u.prodB, A)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it("exporta CSV con una fila por publicación", async () => {
    const csv = await exportarEstadisticasCsv(db, u.lectorA, A);
    const lineas = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lineas[0]).toMatch(/^video,pilar,estado/);
    expect(lineas).toHaveLength(3);
    expect(lineas.join("\n")).toContain("1200");
    expect(lineas.join("\n")).not.toContain("Video B");
  });
});

describe("sincronización con Google (APIs simuladas)", () => {
  const llamadas: string[] = [];
  let siguienteEvento = 0;
  const fetchFalso: typeof fetch = async (entrada, init) => {
    const url = String(entrada);
    const metodo = init?.method ?? "GET";
    llamadas.push(`${metodo} ${url.split("?")[0]}`);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      expect(String(init?.body)).toContain("refresh_token=rt-de-prueba");
      return json({ access_token: "at", scope: "", expires_in: 3600 });
    }
    if (url.includes("/youtube/v3/channels")) {
      return json({ items: [{ id: "UC1", snippet: { title: "Canal A en YouTube" }, contentDetails: { relatedPlaylists: { uploads: "UU1" } } }] });
    }
    if (url.includes("/youtube/v3/playlistItems")) {
      return json({
        items: [
          { snippet: { title: "Video A uno | Canal A" }, contentDetails: { videoId: "AAAAAAAAAA1", videoPublishedAt: "2026-10-19T17:00:00Z" } },
          { snippet: { title: "VIDEO A DOS" }, contentDetails: { videoId: "BBBBBBBBBB2", videoPublishedAt: "2026-10-21T17:00:00Z" } },
          { snippet: { title: "Programado" }, contentDetails: { videoId: "CCCCCCCCCC3" } },
        ],
      });
    }
    if (url.includes("youtubeanalytics.googleapis.com")) {
      const q = new URL(url).searchParams;
      expect(q.get("ids")).toBe("channel==MINE");
      return json({
        columnHeaders: ["video", "views", "averageViewPercentage", "likes", "comments", "shares", "subscribersGained"].map((name) => ({ name })),
        rows: [
          ["AAAAAAAAAA1", 1500, 42.5, 60, 7, 3, 9],
          ["BBBBBBBBBB2", 900, 38, 20, 2, 1, 1],
        ],
      });
    }
    if (url.includes("/calendar/v3/") && metodo === "GET") {
      return json({
        items: [
          { id: "g-reunion", summary: "Reunión de guion", start: { dateTime: "2026-10-20T15:00:00Z" }, end: { dateTime: "2026-10-20T16:00:00Z" } },
          { id: "g-panel", summary: "Publicación: x", start: { dateTime: "2026-10-19T17:00:00Z" }, extendedProperties: { private: { panelVideoId: "v" } } },
          { id: "g-cancelado", status: "cancelled", start: { date: "2026-10-22" } },
        ],
      });
    }
    if (url.includes("/calendar/v3/") && (metodo === "POST" || metodo === "PATCH")) {
      const id = metodo === "PATCH" ? decodeURIComponent(url.split("/events/")[1]) : `ev-${++siguienteEvento}`;
      return json({ id, start: {} });
    }
    return json({ error: { message: `no simulado: ${metodo} ${url}` } }, 404);
  };
  const deps = { fetch: fetchFalso, ahora: new Date("2026-10-28T12:00:00Z"), oauth: { clientId: "c", clientSecret: "s", redirectUri: "https://p.test/cb" } };

  it("sin integración no hace nada", async () => {
    expect((await sincronizarCanal(db, B, deps)).ok).toBe(false);
  });

  it("empareja subidas, trae métricas, escribe y lee el calendario", async () => {
    await db.integracion.create({
      data: { canalId: A, proveedor: "google", refreshTokenCifrado: cifrar("rt-de-prueba", CLAVE), alcances: "x", conectadoPorId: u.adminA.id },
    });
    const r = await sincronizarCanal(db, A, deps);
    expect(r.log.join("\n")).not.toContain("Error");
    expect(r).toMatchObject({ ok: true, publicacionesNuevas: 1, metricasGuardadas: 2, eventosEscritos: 4, reunionesLeidas: 1 });

    const dos = await video(A, "Video A dos");
    const pub = await db.publicacion.findFirstOrThrow({ where: { canalId: A, videoId: dos.id, plataforma: "youtube" } });
    expect(pub.externoId).toBe("BBBBBBBBBB2");
    const m = await db.metrica.findFirstOrThrow({ where: { publicacionId: pub.id } });
    expect(m).toMatchObject({ vistas: 900, retencion: 38, suscriptores: 1, fuente: "youtube_api" });
    expect(m.fecha.toISOString().slice(0, 10)).toBe("2026-10-28");

    expect(await db.eventoCalendario.count({ where: { canalId: A, origen: "panel" } })).toBe(4);
    const reuniones = await db.eventoCalendario.findMany({ where: { canalId: A, origen: "google" } });
    expect(reuniones.map((e) => e.titulo)).toEqual(["Reunión de guion"]);
    const integ = await integracionDeCanal(db, u.lectorA, A);
    expect(integ).toMatchObject({ cuenta: "Canal A en YouTube", youtubeCanalId: "UC1", ultimoError: null });
    expect(await db.ejecucion.count({ where: { canalId: A, tipo: "sincronizacion_google", estado: "ok" } })).toBe(1);
  });

  it("es idempotente: la segunda vez actualiza en vez de duplicar", async () => {
    llamadas.length = 0;
    const r = await sincronizarCanal(db, A, deps);
    expect(r).toMatchObject({ ok: true, publicacionesNuevas: 0, eventosEscritos: 4 });
    expect(llamadas.filter((l) => l.startsWith("PATCH"))).toHaveLength(4);
    expect(llamadas.filter((l) => l.startsWith("POST https://www.googleapis.com/calendar"))).toHaveLength(0);
    expect(await db.eventoCalendario.count({ where: { canalId: A } })).toBe(5);
    expect(await db.publicacion.count({ where: { canalId: A, plataforma: "youtube" } })).toBe(2);
  });

  it("si Google falla, deja el error registrado y no rompe", async () => {
    const roto: typeof fetch = async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    const r = await sincronizarCanal(db, A, { ...deps, fetch: roto });
    expect(r.ok).toBe(false);
    const integ = await db.integracion.findFirstOrThrow({ where: { canalId: A } });
    expect(integ.ultimoError).toMatch(/invalid_grant/);
    expect(await db.ejecucion.count({ where: { canalId: A, estado: "error" } })).toBe(1);
  });
});
