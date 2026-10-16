// Fase 3 contra MySQL real. Aceptación: desde un video en producción se calcula
// el puntaje, se genera el borrador y se adjuntan enlaces con log y costo.
// Además: bloqueo por gancho, forzado de admin, checklist de cifras con fuente,
// tope de gasto y aislamiento entre canales. La IA se simula (sin red ni costo).

import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDB } from "mysql-memory-server";
import { crearPrisma, type Db } from "@/lib/db";
import { guardarCanal, validarConfigCanal } from "@/lib/canales";
import { crearOActualizarUsuario } from "@/lib/usuarios";
import type { Generador } from "@/lib/ia/guion";
import { AccesoDenegado, cambiarEstadoVideo, cargarUsuario, NoEncontrado, TransicionInvalida, type UsuarioSesion } from "@/server/acceso";
import {
  agregarCifra,
  declararSinCifras,
  editarPitch,
  forzarGancho,
  gastoDeVideo,
  generarBorradorGuion,
  marcarSalidaLista,
  registrarEjecucion,
  TopeExcedido,
  verificarCifra,
} from "@/server/produccion";

let mysql: Awaited<ReturnType<typeof createDB>>;
let db: Db;
let A: string;
let B: string;
const u = {} as Record<"adminA" | "prodA" | "revA" | "lectorA" | "prodB", UsuarioSesion>;

const GANCHO_BUENO = "¿Por qué tu banco te cobra 37 dólares al mes?";
const GANCHO_FLOJO = "Hoy vamos a hablar de un tema muy interesante sobre la economía en general";
const drive = (n: string) => `https://drive.google.com/file/d/${n}/view`;

let llamadas = 0;
const generadorFalso: Generador = async (pedido) => {
  llamadas++;
  expect(pedido.canal.voz).toEqual(["Frases cortas."]);
  return {
    borrador: {
      guion: `# ${pedido.video.titulo}\n\n${pedido.video.gancho}\n\n[Pantalla: ilustración] Texto con [CIFRA: comisión media mensual].`,
      cifras: [
        { afirmacion: "[CIFRA: comisión media mensual]", fuente_sugerida: "Superintendencia Financiera" },
        { afirmacion: "37 dólares al mes", fuente_sugerida: "" },
      ],
      notas: "",
    },
    modelo: "claude-opus-5-5",
    uso: { input_tokens: 2000, output_tokens: 4000 },
    fallback: false,
  };
};

beforeAll(async () => {
  mysql = await createDB({ version: "8.4.x", dbName: "panel_prod", xEnabled: "OFF" });
  const url = `mysql://${mysql.username}@127.0.0.1:${mysql.port}/${mysql.dbName}`;
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
  db = crearPrisma(url);
  const config = (slug: string) =>
    validarConfigCanal({
      slug,
      nombre: slug,
      zonaHoraria: "America/Bogota",
      horaPublicacion: "12:00",
      diasPublicacion: ["lun"],
      colorAcento: "#123456",
      pilares: ["P1"],
      reglas: { piezasPorVideo: { largo: 1, tiktok: 4, shorts: 3 }, voz: ["Frases cortas."], estructuraGuion: ["Escena"] },
      limiteGastoVideo: 1,
    });
  A = (await guardarCanal(db, config("canal-a"))).id;
  B = (await guardarCanal(db, config("canal-b"))).id;
  for (const [k, email, canal, rol] of [
    ["adminA", "admin@a.test", "canal-a", "admin"],
    ["prodA", "prod@a.test", "canal-a", "productor"],
    ["revA", "rev@a.test", "canal-a", "revisor"],
    ["lectorA", "lector@a.test", "canal-a", "lector"],
    ["prodB", "prod@b.test", "canal-b", "productor"],
  ] as const) {
    const c = await crearOActualizarUsuario(db, { email, canal, rol });
    u[k] = (await cargarUsuario(db, c.id))!;
  }
  await db.video.createMany({
    data: [
      { canalId: A, titulo: "Tu banco te cobra $37 al mes" },
      { canalId: A, titulo: "Video flojo" },
      { canalId: B, titulo: "Video de B" },
    ],
  });
});

afterAll(async () => {
  await db?.$disconnect();
  await mysql?.stop();
});

const video = (canalId: string, titulo: string) => db.video.findFirstOrThrow({ where: { canalId, titulo } });

describe("puntaje y bloqueo por gancho", () => {
  it("guarda el puntaje y la revisión del título; rechaza títulos de más de 60", async () => {
    const v = await video(A, "Tu banco te cobra $37 al mes");
    const r = await editarPitch(db, u.prodA, A, v.id, { titulo: v.titulo, gancho: GANCHO_BUENO, textoMiniatura: "COMISIÓN OCULTA" });
    expect(r.scoreGancho).toBeGreaterThanOrEqual(72);
    expect(r.revisionTitulo).toMatchObject({ ok: true, banderas: [] });
    await expect(editarPitch(db, u.prodA, A, v.id, { titulo: "x".repeat(61), gancho: GANCHO_BUENO, textoMiniatura: null })).rejects.toThrow(/máximo es 60/);
    await expect(editarPitch(db, u.lectorA, A, v.id, { titulo: "otro", gancho: null, textoMiniatura: null })).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(editarPitch(db, u.prodB, A, v.id, { titulo: "otro", gancho: null, textoMiniatura: null })).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it("un gancho bajo el objetivo bloquea el avance; solo un admin puede forzarlo", async () => {
    const v = await video(A, "Video flojo");
    await editarPitch(db, u.prodA, A, v.id, { titulo: v.titulo, gancho: GANCHO_FLOJO, textoMiniatura: null });
    await cambiarEstadoVideo(db, u.prodA, v.id, "guion");
    await expect(cambiarEstadoVideo(db, u.prodA, v.id, "verificacion")).rejects.toThrow(/gancho/);

    await expect(forzarGancho(db, u.prodA, A, v.id, true)).rejects.toBeInstanceOf(AccesoDenegado);
    await forzarGancho(db, u.adminA, A, v.id, true);
    await cambiarEstadoVideo(db, u.prodA, v.id, "verificacion");

    // Cambiar el gancho invalida el forzado.
    await cambiarEstadoVideo(db, u.prodA, v.id, "guion");
    await editarPitch(db, u.prodA, A, v.id, { titulo: v.titulo, gancho: `${GANCHO_FLOJO} y algo más`, textoMiniatura: null });
    await expect(cambiarEstadoVideo(db, u.prodA, v.id, "verificacion")).rejects.toBeInstanceOf(TransicionInvalida);
  });
});

describe("borrador de guion y checklist de cifras", () => {
  it("genera el borrador, registra costo y log, y crea el checklist de cifras", async () => {
    const v = await video(A, "Tu banco te cobra $37 al mes");
    await cambiarEstadoVideo(db, u.prodA, v.id, "guion");
    const r = await generarBorradorGuion(db, u.prodA, A, v.id, generadorFalso);
    expect(r.guion.version).toBe(1);
    expect(r.cifras).toBe(2);
    expect(r.costo).toBeCloseTo((2000 * 4 + 4000 * 20) / 1e6, 6);

    const ej = await db.ejecucion.findFirstOrThrow({ where: { canalId: A, videoId: v.id, tipo: "guion_ia" } });
    expect(ej.estado).toBe("ok");
    expect(Number(ej.costo)).toBeCloseTo(0.088, 4);
    expect(ej.log).toMatch(/Tokens: 2000 de entrada, 4000 de salida/);
    expect((await db.video.findUniqueOrThrow({ where: { id: v.id } })).fuentesOk).toBe(false);
    await expect(generarBorradorGuion(db, u.lectorA, A, v.id, generadorFalso)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it("sin fuente no se verifica; con todas verificadas pasa a producción", async () => {
    const v = await video(A, "Tu banco te cobra $37 al mes");
    await cambiarEstadoVideo(db, u.prodA, v.id, "verificacion");
    await expect(cambiarEstadoVideo(db, u.prodA, v.id, "produccion")).rejects.toThrow(/fuente/i);

    const cifras = await db.tarea.findMany({ where: { canalId: A, videoId: v.id, tipo: "verificacion_cifra" } });
    expect(cifras).toHaveLength(2);
    await expect(verificarCifra(db, u.revA, A, cifras[0].id, "")).rejects.toThrow(/enlace/);
    await expect(verificarCifra(db, u.revA, A, cifras[0].id, "javascript:alert(1)")).rejects.toThrow(/http/);
    await expect(verificarCifra(db, u.lectorA, A, cifras[0].id, "https://x.test")).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(verificarCifra(db, u.prodB, B, cifras[0].id, "https://x.test")).rejects.toBeInstanceOf(NoEncontrado);

    await verificarCifra(db, u.revA, A, cifras[0].id, "https://www.superfinanciera.gov.co/informe");
    expect((await db.video.findUniqueOrThrow({ where: { id: v.id } })).fuentesOk).toBe(false);
    await verificarCifra(db, u.prodA, A, cifras[1].id, "https://ejemplo.test/fuente");
    expect((await db.video.findUniqueOrThrow({ where: { id: v.id } })).fuentesOk).toBe(true);
    await cambiarEstadoVideo(db, u.prodA, v.id, "produccion");
  });

  it("declarar «sin cifras» exige revisor o admin y un checklist vacío", async () => {
    const v = await db.video.create({ data: { canalId: A, titulo: "Sin datos" } });
    await expect(declararSinCifras(db, u.prodA, A, v.id)).rejects.toBeInstanceOf(AccesoDenegado);
    await declararSinCifras(db, u.revA, A, v.id);
    expect((await db.video.findUniqueOrThrow({ where: { id: v.id } })).fuentesOk).toBe(true);
    await agregarCifra(db, u.prodA, A, v.id, "Una cifra nueva");
    expect((await db.video.findUniqueOrThrow({ where: { id: v.id } })).fuentesOk).toBe(false);
  });
});

describe("ejecuciones, tope de gasto y salida lista", () => {
  it("registra tareas externas con costo y respeta el tope del video", async () => {
    const v = await video(A, "Tu banco te cobra $37 al mes");
    await registrarEjecucion(db, u.prodA, A, {
      videoId: v.id,
      tipo: "voz",
      estado: "ok",
      costo: 0.3,
      salidaUrl: drive("voz"),
      log: "ElevenLabs, 1 toma",
    });
    expect(await gastoDeVideo(db, A, v.id)).toEqual({ gastado: 0.388, tope: 1 });
    await expect(
      registrarEjecucion(db, u.prodA, A, { videoId: v.id, tipo: "imagenes", estado: "ok", costo: 0.7, salidaUrl: null, log: null }),
    ).rejects.toBeInstanceOf(TopeExcedido);
    await expect(
      registrarEjecucion(db, u.prodB, A, { videoId: v.id, tipo: "voz", estado: "ok", costo: 0, salidaUrl: null, log: null }),
    ).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it("no llama a la IA si el peor caso no cabe en el tope", async () => {
    const v = await db.video.create({ data: { canalId: A, titulo: "Con tope chico", limiteGasto: 0.05 } });
    const antes = llamadas;
    await expect(generarBorradorGuion(db, u.prodA, A, v.id, generadorFalso)).rejects.toBeInstanceOf(TopeExcedido);
    expect(llamadas).toBe(antes);
  });

  it("marca la salida lista con 1 largo, 4 TikToks y 3 Shorts de Drive, con log y costo", async () => {
    const v = await video(A, "Tu banco te cobra $37 al mes");
    const enlaces = {
      largo: [drive("largo")],
      tiktok: [1, 2, 3, 4].map((i) => drive(`tt${i}`)),
      shorts: [1, 2, 3].map((i) => drive(`sh${i}`)),
    };
    await expect(
      marcarSalidaLista(db, u.prodA, A, v.id, { enlaces: { ...enlaces, tiktok: enlaces.tiktok.slice(0, 3) }, costo: 0, nota: null, pasarARevision: false }),
    ).rejects.toThrow(/tiktok/);
    await expect(
      marcarSalidaLista(db, u.prodA, A, v.id, { enlaces: { ...enlaces, largo: ["https://wetransfer.com/x"] }, costo: 0, nota: null, pasarARevision: false }),
    ).rejects.toThrow(/Google Drive/);

    const r = await marcarSalidaLista(db, u.prodA, A, v.id, { enlaces, costo: 0.12, nota: "Render en la PC", pasarARevision: true });
    expect(r.activos).toHaveLength(8);
    expect(r.transicion).toEqual({ ok: true });
    expect(r.ejecucion).toMatchObject({ tipo: "salida_lista", estado: "ok", salidaUrl: drive("largo") });
    expect(Number(r.ejecucion.costo)).toBeCloseTo(0.12, 4);
    expect(r.ejecucion.log).toContain("tiktok 4 (v1)");
    expect(r.ejecucion.log).toContain("Nota: Render en la PC");

    const final = await db.video.findUniqueOrThrow({ where: { id: v.id } });
    expect(final.estado).toBe("revision");
    expect(await db.activo.count({ where: { canalId: A, videoId: v.id } })).toBe(8);
    expect(await db.activo.count({ where: { canalId: B } })).toBe(0);
    // Ya no está en producción: no se puede volver a marcar.
    await expect(marcarSalidaLista(db, u.prodA, A, v.id, { enlaces, costo: 0, nota: null, pasarARevision: false })).rejects.toThrow(/Producción/);
  });
});
