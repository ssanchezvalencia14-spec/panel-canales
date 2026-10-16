// Fase 3: producción asistida. Puntaje de gancho y título, checklist de cifras,
// borradores de guion con IA, ejecuciones externas con tope de gasto y
// «salida lista». El panel no renderiza video: solo registra estado, enlaces,
// log y costo. Todo pasa por permisos y por canal_id.

import type { Db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { puede, type Accion } from "@/lib/dominio/roles";
import { leerPilares } from "@/lib/dominio/canal-config";
import { fechaLocal, fechaLocalAUtc } from "@/lib/dominio/fechas";
import { puntuarGancho } from "@/lib/puntaje/gancho";
import { limitesDeCanal, revisarTitulo } from "@/lib/puntaje/titulo";
import { costoDe, costoMaximo, construirPrompt, ErrorGenerador, MODELO_GUION, type Generador, type PedidoGuion } from "@/lib/ia/guion";
import { AccesoDenegado, cambiarEstadoVideo, NoEncontrado, TransicionInvalida, type UsuarioSesion } from "./acceso";
import { DatoInvalido } from "./metricas";

function exigir(u: UsuarioSesion, canalId: string, accion: Accion, mensaje?: string) {
  if (!puede(u, canalId, accion)) throw new AccesoDenegado(mensaje);
}

async function videoDelCanal(db: Db, canalId: string, videoId: string) {
  const v = await db.video.findFirst({ where: { id: videoId, canalId }, include: { canal: true } });
  if (!v) throw new NoEncontrado("Video no encontrado en este canal.");
  return v;
}

const aJson = (x: unknown) => JSON.parse(JSON.stringify(x)) as Prisma.InputJsonValue;

// ─────────────────────────── Título, gancho y miniatura ───────────────────────────

export async function editarPitch(
  db: Db,
  u: UsuarioSesion,
  canalId: string,
  videoId: string,
  datos: { titulo: string; gancho: string | null; textoMiniatura: string | null },
) {
  exigir(u, canalId, "editar_video", "Tu rol no permite editar videos.");
  const v = await videoDelCanal(db, canalId, videoId);
  const titulo = datos.titulo.trim();
  if (!titulo) throw new DatoInvalido("El título no puede quedar vacío.");
  const revision = revisarTitulo(titulo, datos.textoMiniatura, limitesDeCanal(v.canal.reglas));
  if (!revision.ok) throw new DatoInvalido(revision.banderas.filter((b) => b.gravedad === "error").map((b) => b.mensaje).join(" "));

  const gancho = datos.gancho?.trim() || null;
  const puntaje = gancho ? puntuarGancho(gancho) : null;
  const ganchoCambio = gancho !== (v.gancho ?? null);
  return db.video.update({
    where: { id: v.id },
    data: {
      titulo,
      gancho,
      textoMiniatura: datos.textoMiniatura?.trim() || null,
      scoreGancho: puntaje?.total ?? null,
      puntajeGancho: puntaje ? aJson(puntaje) : Prisma.DbNull,
      revisionTitulo: aJson(revision),
      // Un forzado vale para un gancho concreto: si cambia, se pierde.
      ...(ganchoCambio ? { ganchoForzadoPorId: null, ganchoForzadoEn: null } : {}),
    },
  });
}

/** Vuelve a calcular puntaje y revisión con las reglas actuales (sin cambiar textos). */
export async function recalcularPuntaje(db: Db, u: UsuarioSesion, canalId: string, videoId: string) {
  exigir(u, canalId, "editar_video", "Tu rol no permite editar videos.");
  const v = await videoDelCanal(db, canalId, videoId);
  const puntaje = v.gancho ? puntuarGancho(v.gancho) : null;
  const revision = revisarTitulo(v.titulo, v.textoMiniatura, limitesDeCanal(v.canal.reglas));
  return db.video.update({
    where: { id: v.id },
    data: {
      scoreGancho: puntaje?.total ?? null,
      puntajeGancho: puntaje ? aJson(puntaje) : Prisma.DbNull,
      revisionTitulo: aJson(revision),
    },
  });
}

/** Solo un admin del canal: deja avanzar un video aunque el gancho no llegue al objetivo. */
export async function forzarGancho(db: Db, u: UsuarioSesion, canalId: string, videoId: string, forzar: boolean) {
  exigir(u, canalId, "configurar_canal", "Solo un admin del canal puede forzar el gancho.");
  const v = await videoDelCanal(db, canalId, videoId);
  if (forzar && !v.gancho) throw new DatoInvalido("El video no tiene gancho escrito.");
  return db.video.update({
    where: { id: v.id },
    data: forzar ? { ganchoForzadoPorId: u.id, ganchoForzadoEn: new Date() } : { ganchoForzadoPorId: null, ganchoForzadoEn: null },
  });
}

// ─────────────────────────── Checklist de cifras ───────────────────────────

export const TIPO_CIFRA = "verificacion_cifra";

/** fuentes_ok = todas las cifras verificadas (si hay alguna). */
async function recalcularFuentes(db: Db, canalId: string, videoId: string) {
  const [total, pendientes] = await Promise.all([
    db.tarea.count({ where: { canalId, videoId, tipo: TIPO_CIFRA } }),
    db.tarea.count({ where: { canalId, videoId, tipo: TIPO_CIFRA, estado: { not: "hecha" } } }),
  ]);
  if (total > 0) await db.video.update({ where: { id: videoId }, data: { fuentesOk: pendientes === 0 } });
  return { total, pendientes };
}

export async function agregarCifra(db: Db, u: UsuarioSesion, canalId: string, videoId: string, afirmacion: string) {
  exigir(u, canalId, "editar_video", "Tu rol no permite editar videos.");
  await videoDelCanal(db, canalId, videoId);
  const texto = afirmacion.trim();
  if (!texto) throw new DatoInvalido("Escribe la cifra o el dato a verificar.");
  await db.tarea.create({ data: { canalId, videoId, tipo: TIPO_CIFRA, descripcion: texto.slice(0, 2000) } });
  return recalcularFuentes(db, canalId, videoId);
}

function urlValida(texto: string): string {
  let url: URL;
  try {
    url = new URL(texto.trim());
  } catch {
    throw new DatoInvalido("La fuente debe ser un enlace (https://…).");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new DatoInvalido("La fuente debe ser un enlace http(s).");
  return url.toString();
}

/** Marca una cifra como verificada. La fuente es obligatoria. Productor, revisor o admin. */
export async function verificarCifra(db: Db, u: UsuarioSesion, canalId: string, tareaId: string, fuente: string) {
  if (!puede(u, canalId, "editar_video") && !puede(u, canalId, "aprobar")) throw new AccesoDenegado("Tu rol no permite verificar cifras.");
  const t = await db.tarea.findFirst({ where: { id: tareaId, canalId, tipo: TIPO_CIFRA } });
  if (!t) throw new NoEncontrado("Cifra no encontrada.");
  await db.tarea.update({ where: { id: t.id }, data: { estado: "hecha", fuenteUrl: urlValida(fuente), responsableId: u.id } });
  return recalcularFuentes(db, canalId, t.videoId);
}

export async function reabrirCifra(db: Db, u: UsuarioSesion, canalId: string, tareaId: string) {
  if (!puede(u, canalId, "editar_video") && !puede(u, canalId, "aprobar")) throw new AccesoDenegado("Tu rol no permite verificar cifras.");
  const t = await db.tarea.findFirst({ where: { id: tareaId, canalId, tipo: TIPO_CIFRA } });
  if (!t) throw new NoEncontrado("Cifra no encontrada.");
  await db.tarea.update({ where: { id: t.id }, data: { estado: "pendiente" } });
  return recalcularFuentes(db, canalId, t.videoId);
}

/** Para videos sin cifras de terceros: se declara explícitamente y queda registrado. */
export async function declararSinCifras(db: Db, u: UsuarioSesion, canalId: string, videoId: string) {
  exigir(u, canalId, "aprobar", "Solo un revisor o admin puede declarar que el video no tiene cifras que verificar.");
  await videoDelCanal(db, canalId, videoId);
  const total = await db.tarea.count({ where: { canalId, videoId, tipo: TIPO_CIFRA } });
  if (total > 0) throw new DatoInvalido("El video tiene cifras en el checklist: verifícalas una por una.");
  await db.ejecucion.create({
    data: { canalId, videoId, tipo: "verificacion", estado: "ok", registradoPorId: u.id, costo: 0, log: `Declarado sin cifras que verificar por ${u.email}.` },
  });
  return db.video.update({ where: { id: videoId }, data: { fuentesOk: true } });
}

// ─────────────────────────── Gasto ───────────────────────────

export class TopeExcedido extends TransicionInvalida {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "TopeExcedido";
  }
}

const num = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? null : Number(d));

export async function gastoDeVideo(db: Db, canalId: string, videoId: string) {
  const [suma, v] = await Promise.all([
    db.ejecucion.aggregate({ where: { canalId, videoId }, _sum: { costo: true } }),
    db.video.findFirst({ where: { id: videoId, canalId }, select: { limiteGasto: true, canal: { select: { limiteGastoVideo: true } } } }),
  ]);
  const tope = num(v?.limiteGasto) ?? num(v?.canal.limiteGastoVideo);
  return { gastado: Math.round((num(suma._sum.costo) ?? 0) * 10_000) / 10_000, tope };
}

/** Tope mensual del canal (reglas.limiteGastoMensual, USD). Sin regla = sin tope. */
export function topeMensual(reglas: unknown): number | null {
  const v = (reglas as { limiteGastoMensual?: unknown } | null)?.limiteGastoMensual;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

/** Gasto del mes calendario en curso (zona horaria del canal), total y por tipo de ejecución. */
export async function gastoDelMes(db: Db, canalId: string, ahora = new Date()) {
  const canal = await db.canal.findUniqueOrThrow({ where: { id: canalId }, select: { zonaHoraria: true, reglas: true } });
  const mes = fechaLocal(ahora, canal.zonaHoraria).slice(0, 7);
  const desde = fechaLocalAUtc(`${mes}-01`, "00:00", canal.zonaHoraria);
  const grupos = await db.ejecucion.groupBy({ by: ["tipo"], where: { canalId, creadoEn: { gte: desde } }, _sum: { costo: true }, _count: true });
  const porTipo = grupos
    .map((g) => ({ tipo: g.tipo, total: num(g._sum.costo) ?? 0, cantidad: g._count }))
    .sort((a, b) => b.total - a.total);
  const gastado = Math.round(porTipo.reduce((a, g) => a + g.total, 0) * 10_000) / 10_000;
  return { mes, desde, gastado, tope: topeMensual(canal.reglas), porTipo };
}

/** Bloquea cualquier gasto que haría pasar el tope mensual del canal. */
export async function exigirTopeMensual(db: Db, canalId: string, adicional: number, ahora = new Date()) {
  if (adicional <= 0) return;
  const { gastado, tope, mes } = await gastoDelMes(db, canalId, ahora);
  if (tope !== null && gastado + adicional > tope + 1e-9) {
    throw new TopeExcedido(
      `Supera el tope mensual del canal (${mes}): lleva US$ ${gastado.toFixed(2)} de US$ ${tope.toFixed(2)} y esto suma US$ ${adicional.toFixed(2)}. Un admin puede subir «limiteGastoMensual».`,
    );
  }
}

async function exigirTope(db: Db, canalId: string, videoId: string, adicional: number) {
  if (adicional <= 0) return;
  await exigirTopeMensual(db, canalId, adicional);
  const { gastado, tope } = await gastoDeVideo(db, canalId, videoId);
  if (tope !== null && gastado + adicional > tope + 1e-9) {
    throw new TopeExcedido(
      `Supera el tope de gasto del video: lleva US$ ${gastado.toFixed(2)} de US$ ${tope.toFixed(2)} y esto suma US$ ${adicional.toFixed(2)}. Un admin puede subir el tope.`,
    );
  }
}

export async function cambiarTopeVideo(db: Db, u: UsuarioSesion, canalId: string, videoId: string, tope: number | null) {
  exigir(u, canalId, "configurar_canal", "Solo un admin del canal puede cambiar el tope de gasto.");
  if (tope !== null && (!Number.isFinite(tope) || tope < 0)) throw new DatoInvalido("El tope debe ser un número positivo.");
  await videoDelCanal(db, canalId, videoId);
  return db.video.update({ where: { id: videoId }, data: { limiteGasto: tope } });
}

export async function cambiarTopeCanal(db: Db, u: UsuarioSesion, canalId: string, tope: number | null) {
  exigir(u, canalId, "configurar_canal", "Solo un admin del canal puede cambiar el tope de gasto.");
  if (tope !== null && (!Number.isFinite(tope) || tope < 0)) throw new DatoInvalido("El tope debe ser un número positivo.");
  return db.canal.update({ where: { id: canalId }, data: { limiteGastoVideo: tope } });
}

export async function cambiarTopeMensual(db: Db, u: UsuarioSesion, canalId: string, tope: number | null) {
  exigir(u, canalId, "configurar_canal", "Solo un admin del canal puede cambiar el tope mensual.");
  if (tope !== null && (!Number.isFinite(tope) || tope < 0)) throw new DatoInvalido("El tope debe ser un número positivo.");
  const canal = await db.canal.findUniqueOrThrow({ where: { id: canalId }, select: { reglas: true } });
  const reglas = { ...((canal.reglas ?? {}) as Record<string, unknown>) };
  if (tope === null) delete reglas.limiteGastoMensual;
  else reglas.limiteGastoMensual = tope;
  return db.canal.update({ where: { id: canalId }, data: { reglas: aJson(reglas) } });
}

export async function gastoMensualCanal(db: Db, u: UsuarioSesion, canalId: string, ahora = new Date()) {
  exigir(u, canalId, "ver");
  return gastoDelMes(db, canalId, ahora);
}

// ─────────────────────────── Ejecuciones externas ───────────────────────────

export const TIPOS_EJECUCION = ["voz", "imagenes", "subtitulos", "render", "guion_ia", "salida_lista", "otro"] as const;
export type TipoEjecucion = (typeof TIPOS_EJECUCION)[number];
export const NOMBRE_TIPO_EJECUCION: Record<string, string> = {
  voz: "Voz (ElevenLabs u otra)",
  imagenes: "Imágenes",
  subtitulos: "Subtítulos",
  render: "Render (Remotion en la PC)",
  guion_ia: "Borrador de guion (IA)",
  salida_lista: "Salida lista",
  sincronizacion_google: "Sincronización con Google",
  verificacion: "Verificación",
  investigacion: "Investigación de referencias",
  otro: "Otro",
};

export type DatosEjecucion = {
  videoId: string | null;
  tipo: TipoEjecucion;
  estado: "en_cola" | "en_curso" | "ok" | "error";
  costo: number | null;
  salidaUrl: string | null;
  log: string | null;
};

function validarEjecucion(d: DatosEjecucion) {
  if (d.costo !== null && (!Number.isFinite(d.costo) || d.costo < 0)) throw new DatoInvalido("El costo debe ser un número positivo.");
  if (d.salidaUrl) urlValida(d.salidaUrl);
}

export async function registrarEjecucion(db: Db, u: UsuarioSesion, canalId: string, d: DatosEjecucion) {
  exigir(u, canalId, "editar_video", "Tu rol no permite registrar ejecuciones.");
  validarEjecucion(d);
  if (d.videoId) {
    await videoDelCanal(db, canalId, d.videoId);
    await exigirTope(db, canalId, d.videoId, d.costo ?? 0);
  } else {
    await exigirTopeMensual(db, canalId, d.costo ?? 0);
  }
  return db.ejecucion.create({
    data: {
      canalId,
      videoId: d.videoId,
      tipo: d.tipo,
      estado: d.estado,
      costo: d.costo ?? 0,
      salidaUrl: d.salidaUrl ? urlValida(d.salidaUrl) : null,
      log: d.log?.slice(0, 20_000) ?? null,
      registradoPorId: u.id,
    },
  });
}

export async function actualizarEjecucion(
  db: Db,
  u: UsuarioSesion,
  canalId: string,
  id: string,
  d: Pick<DatosEjecucion, "estado" | "costo" | "salidaUrl"> & { nota: string | null },
) {
  exigir(u, canalId, "editar_video", "Tu rol no permite editar ejecuciones.");
  const e = await db.ejecucion.findFirst({ where: { id, canalId } });
  if (!e) throw new NoEncontrado("Ejecución no encontrada.");
  validarEjecucion({ ...d, videoId: e.videoId, tipo: "otro", log: null });
  if (d.costo !== null) {
    const extra = d.costo - (num(e.costo) ?? 0);
    if (e.videoId) await exigirTope(db, canalId, e.videoId, extra);
    else await exigirTopeMensual(db, canalId, extra);
  }
  const sello = `[${new Date().toISOString().slice(0, 16).replace("T", " ")} ${u.email}] ${d.estado}${d.nota ? `: ${d.nota}` : ""}`;
  return db.ejecucion.update({
    where: { id: e.id },
    data: {
      estado: d.estado,
      ...(d.costo !== null ? { costo: d.costo } : {}),
      ...(d.salidaUrl ? { salidaUrl: urlValida(d.salidaUrl) } : {}),
      log: [e.log, sello].filter(Boolean).join("\n").slice(-20_000),
    },
  });
}

export async function listarEjecuciones(db: Db, u: UsuarioSesion, canalId: string, videoId?: string) {
  exigir(u, canalId, "ver");
  return db.ejecucion.findMany({
    where: { canalId, ...(videoId ? { videoId } : {}) },
    orderBy: { creadoEn: "desc" },
    take: 200,
    select: {
      id: true,
      tipo: true,
      estado: true,
      costo: true,
      salidaUrl: true,
      log: true,
      creadoEn: true,
      video: { select: { id: true, titulo: true } },
      registradoPor: { select: { email: true } },
    },
  });
}

// ─────────────────────────── Salida lista ───────────────────────────

export type Piezas = { largo: number; tiktok: number; shorts: number };

/** Piezas por video según las reglas del canal (por defecto, solo el largo). */
export function piezasDeCanal(reglas: unknown): Piezas {
  const p = (reglas as { piezasPorVideo?: Partial<Record<keyof Piezas, unknown>> } | null)?.piezasPorVideo ?? {};
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 20 ? v : d);
  return { largo: n(p.largo, 1), tiktok: n(p.tiktok, 0), shorts: n(p.shorts, 0) };
}

export function esEnlaceDrive(texto: string): boolean {
  try {
    const u = new URL(texto.trim());
    return u.protocol === "https:" && /^(drive|docs)\.google\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

const TIPO_ACTIVO: Record<keyof Piezas, string> = { largo: "video_largo", tiktok: "tiktok", shorts: "short" };

export async function marcarSalidaLista(
  db: Db,
  u: UsuarioSesion,
  canalId: string,
  videoId: string,
  datos: { enlaces: Record<keyof Piezas, string[]>; costo: number | null; nota: string | null; pasarARevision: boolean },
) {
  exigir(u, canalId, "editar_video", "Tu rol no permite marcar la salida.");
  const v = await videoDelCanal(db, canalId, videoId);
  if (v.estado !== "produccion") throw new DatoInvalido("La salida se marca con el video en «Producción».");
  const piezas = piezasDeCanal(v.canal.reglas);

  const errores: string[] = [];
  for (const k of Object.keys(piezas) as (keyof Piezas)[]) {
    const lista = (datos.enlaces[k] ?? []).map((x) => x.trim()).filter(Boolean);
    if (lista.length !== piezas[k]) errores.push(`Faltan enlaces de ${k}: se esperan ${piezas[k]}, hay ${lista.length}.`);
    lista.forEach((x, i) => {
      if (!esEnlaceDrive(x)) errores.push(`${k} ${i + 1}: no es un enlace de Google Drive.`);
    });
  }
  if (errores.length) throw new DatoInvalido(errores.join(" "));
  if (datos.costo !== null && (!Number.isFinite(datos.costo) || datos.costo < 0)) throw new DatoInvalido("El costo debe ser un número positivo.");
  await exigirTope(db, canalId, videoId, datos.costo ?? 0);

  const lineas: string[] = [];
  const activos = await db.$transaction(async (tx) => {
    const creados = [];
    for (const k of Object.keys(piezas) as (keyof Piezas)[]) {
      const tipo = TIPO_ACTIVO[k];
      const previo = await tx.activo.aggregate({ where: { canalId, videoId, tipo }, _max: { version: true } });
      const version = (previo._max.version ?? 0) + 1;
      for (const [i, url] of datos.enlaces[k].map((x) => x.trim()).filter(Boolean).entries()) {
        creados.push(await tx.activo.create({ data: { canalId, videoId, tipo, url, version } }));
        lineas.push(`${tipo} ${i + 1} (v${version}): ${url}`);
      }
    }
    return creados;
  });

  const ejecucion = await db.ejecucion.create({
    data: {
      canalId,
      videoId,
      tipo: "salida_lista",
      estado: "ok",
      costo: datos.costo ?? 0,
      salidaUrl: datos.enlaces.largo[0]?.trim() ?? null,
      registradoPorId: u.id,
      log: [`Salida lista marcada por ${u.email}.`, ...lineas, datos.nota ? `Nota: ${datos.nota}` : ""].filter(Boolean).join("\n"),
    },
  });

  let transicion: { ok: true } | { ok: false; motivo: string } | null = null;
  if (datos.pasarARevision) {
    try {
      await cambiarEstadoVideo(db, u, videoId, "revision");
      transicion = { ok: true };
    } catch (e) {
      if (e instanceof TransicionInvalida || e instanceof AccesoDenegado) transicion = { ok: false, motivo: e.message };
      else throw e;
    }
  }
  return { activos, ejecucion, transicion };
}

// ─────────────────────────── Guiones ───────────────────────────

const lista = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);

export type VideoParaGuion = {
  titulo: string;
  pilar: string | null;
  gancho: string | null;
  textoMiniatura: string | null;
  notas: string | null;
  canal: { nombre: string; idioma: string; pilares: unknown; reglas: unknown };
};

export function pedidoDeVideo(v: VideoParaGuion): PedidoGuion {
  const reglas = (v.canal.reglas ?? {}) as Record<string, unknown>;
  return {
    canal: {
      nombre: v.canal.nombre,
      idioma: v.canal.idioma,
      pilares: leerPilares(v.canal.pilares),
      voz: lista(reglas.voz),
      estructura: lista(reglas.estructuraGuion),
      extension: typeof reglas.extensionGuion === "string" ? reglas.extensionGuion : null,
    },
    video: { titulo: v.titulo, pilar: v.pilar, gancho: v.gancho, textoMiniatura: v.textoMiniatura, notas: v.notas },
  };
}

export async function generarBorradorGuion(db: Db, u: UsuarioSesion, canalId: string, videoId: string, generar: Generador) {
  exigir(u, canalId, "editar_video", "Tu rol no permite generar guiones.");
  const v = await videoDelCanal(db, canalId, videoId);
  const pedido = pedidoDeVideo(v);
  const { system, usuario } = construirPrompt(pedido);
  // Antes de gastar: el peor caso de esta llamada tiene que caber en el tope.
  await exigirTope(db, canalId, videoId, costoMaximo(system.length + usuario.length));

  const ejecucion = await db.ejecucion.create({
    data: { canalId, videoId, tipo: "guion_ia", estado: "en_curso", registradoPorId: u.id, log: `Modelo pedido: ${MODELO_GUION}` },
  });
  try {
    const r = await generar(pedido);
    const costo = costoDe(r.modelo, r.uso);
    const ultima = await db.guion.aggregate({ where: { videoId }, _max: { version: true } });
    const guion = await db.guion.create({
      data: {
        canalId,
        videoId,
        version: (ultima._max.version ?? 0) + 1,
        contenido: r.borrador.guion,
        modelo: r.modelo,
        ejecucionId: ejecucion.id,
        creadoPorId: u.id,
      },
    });
    for (const c of r.borrador.cifras) {
      await db.tarea.create({
        data: {
          canalId,
          videoId,
          tipo: TIPO_CIFRA,
          descripcion: [c.afirmacion, c.fuente_sugerida ? `Fuente sugerida: ${c.fuente_sugerida}` : ""].filter(Boolean).join("\n").slice(0, 2000),
        },
      });
    }
    if (r.borrador.cifras.length) await db.video.update({ where: { id: videoId }, data: { fuentesOk: false } });
    await db.ejecucion.update({
      where: { id: ejecucion.id },
      data: {
        estado: "ok",
        costo: costo.usd,
        log: [
          `Modelo: ${r.modelo}${r.fallback ? " (respaldo tras un rechazo del modelo principal)" : ""}`,
          `Tokens: ${r.uso.input_tokens} de entrada, ${r.uso.output_tokens} de salida`,
          `Costo: US$ ${costo.usd.toFixed(4)}${costo.estimado ? " (estimado)" : ""}`,
          `Guion v${guion.version}: ${r.borrador.guion.split(/\s+/).length} palabras, ${r.borrador.cifras.length} cifras a verificar`,
          r.borrador.notas ? `Notas del modelo: ${r.borrador.notas}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    });
    return { guion, cifras: r.borrador.cifras.length, costo: costo.usd, notas: r.borrador.notas };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await db.ejecucion.update({ where: { id: ejecucion.id }, data: { estado: "error", log: `Error: ${mensaje}`.slice(0, 20_000) } });
    if (e instanceof ErrorGenerador) throw new DatoInvalido(e.message);
    throw new DatoInvalido("No se pudo generar el borrador. El error quedó en el registro de ejecuciones.");
  }
}

export async function guardarGuionManual(db: Db, u: UsuarioSesion, canalId: string, videoId: string, contenido: string) {
  exigir(u, canalId, "editar_video", "Tu rol no permite editar guiones.");
  await videoDelCanal(db, canalId, videoId);
  if (!contenido.trim()) throw new DatoInvalido("El guion está vacío.");
  const ultima = await db.guion.aggregate({ where: { videoId }, _max: { version: true } });
  return db.guion.create({
    data: { canalId, videoId, version: (ultima._max.version ?? 0) + 1, contenido, modelo: null, creadoPorId: u.id },
  });
}

export async function produccionDeVideo(db: Db, u: UsuarioSesion, canalId: string, videoId: string) {
  exigir(u, canalId, "ver");
  const [cifras, guiones, activos, gasto, ejecuciones] = await Promise.all([
    db.tarea.findMany({
      where: { canalId, videoId, tipo: TIPO_CIFRA },
      orderBy: { creadoEn: "asc" },
      select: { id: true, descripcion: true, estado: true, fuenteUrl: true, responsable: { select: { email: true } } },
    }),
    db.guion.findMany({
      where: { canalId, videoId },
      orderBy: { version: "desc" },
      take: 10,
      select: { id: true, version: true, contenido: true, modelo: true, creadoEn: true, creadoPor: { select: { email: true } } },
    }),
    db.activo.findMany({ where: { canalId, videoId }, orderBy: [{ tipo: "asc" }, { version: "desc" }, { creadoEn: "asc" }] }),
    gastoDeVideo(db, canalId, videoId),
    listarEjecuciones(db, u, canalId, videoId),
  ]);
  return { cifras, guiones, activos, gasto, ejecuciones };
}
