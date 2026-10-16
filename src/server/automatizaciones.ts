// Fase 5: automatizaciones y reportes.
//  - Alertas: el cron diario abre las nuevas, cierra las resueltas y avisa a
//    los admins del canal. Quedan como historial.
//  - Resumen semanal: el cron lo deja en borrador; un admin lo revisa y lo
//    envía al equipo con confirmación explícita.
//  - Investigación de referencias: Claude con búsqueda web, con tope de gasto,
//    guardada como informe con su costo en ejecuciones.

import type { Db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { puede, type Accion } from "@/lib/dominio/roles";
import { leerPilares } from "@/lib/dominio/canal-config";
import { diasProduccion } from "@/lib/dominio/calendario";
import { fechaLocal, fechaLocalAUtc } from "@/lib/dominio/fechas";
import { evaluarAlertas, reglasDeAlertas } from "@/lib/automatizacion/alertas";
import { limitesSemana, semanaISO } from "@/lib/automatizacion/semana";
import { textoResumen } from "@/lib/automatizacion/resumen";
import { enviarCorreo } from "@/lib/correo";
import { nombrePanel } from "@/lib/panel";
import { costoMaximoInvestigacion, promptInvestigacion, type Investigador } from "@/lib/ia/investigacion";
import { ErrorGenerador, MODELO_GUION } from "@/lib/ia/guion";
import { combinarMetricas } from "@/lib/metricas/resultados";
import { AccesoDenegado, NoEncontrado, type UsuarioSesion } from "./acceso";
import { avisarEquipo, registrarActividad } from "./actividad";
import { DatoInvalido } from "./metricas";
import { exigirTopeMensual, TIPO_CIFRA, TopeExcedido } from "./produccion";
import { log } from "@/lib/log";

function exigir(u: UsuarioSesion, canalId: string, accion: Accion, mensaje?: string) {
  if (!puede(u, canalId, accion)) throw new AccesoDenegado(mensaje);
}

async function correosAdmins(db: Db, canalId: string) {
  const m = await db.membresia.findMany({ where: { canalId, rol: "admin", user: { activo: true } }, select: { user: { select: { email: true } } } });
  const sa = await db.user.findMany({ where: { esSuperadmin: true, activo: true }, select: { email: true } });
  return [...new Set([...m.map((x) => x.user.email), ...sa.map((x) => x.email)])];
}

// ─────────────────────────── Alertas ───────────────────────────

export async function sincronizarAlertas(db: Db, canalId: string, ahora = new Date()) {
  const canal = await db.canal.findUniqueOrThrow({ where: { id: canalId } });
  const videos = await db.video.findMany({
    where: { canalId },
    select: { id: true, titulo: true, estado: true, fechaPublicacion: true, fuentesOk: true },
  });
  const pendientes = await db.tarea.groupBy({
    by: ["videoId"],
    where: { canalId, tipo: TIPO_CIFRA, estado: { not: "hecha" } },
    _count: { _all: true },
  });
  const porVideo = new Map(pendientes.map((p) => [p.videoId, p._count._all]));
  const calculadas = evaluarAlertas(
    videos.map((v) => ({ ...v, cifrasPendientes: porVideo.get(v.id) ?? 0 })),
    ahora,
    canal.zonaHoraria,
    { diasProduccion: diasProduccion(canal.reglas), ...reglasDeAlertas(canal.reglas) },
  );

  const abiertas = await db.alerta.findMany({ where: { canalId, cerradaEn: null } });
  const claves = new Set(calculadas.map((a) => a.clave));
  const nuevas = calculadas.filter((a) => !abiertas.some((x) => x.clave === a.clave));
  const resueltas = abiertas.filter((x) => !claves.has(x.clave));

  for (const a of nuevas) {
    await db.alerta.create({ data: { canalId, videoId: a.videoId, tipo: a.tipo, clave: a.clave, mensaje: a.mensaje, gravedad: a.gravedad, abiertaEn: ahora } });
  }
  // Las que siguen abiertas se actualizan (el texto puede cambiar: días, estado).
  for (const a of calculadas) {
    const previa = abiertas.find((x) => x.clave === a.clave);
    if (previa && (previa.mensaje !== a.mensaje || previa.gravedad !== a.gravedad)) {
      await db.alerta.update({ where: { id: previa.id }, data: { mensaje: a.mensaje, gravedad: a.gravedad } });
    }
  }
  if (resueltas.length) {
    await db.alerta.updateMany({ where: { id: { in: resueltas.map((x) => x.id) } }, data: { cerradaEn: ahora } });
  }

  if (nuevas.length) {
    const para = await correosAdmins(db, canalId);
    try {
      await enviarCorreo({
        para,
        asunto: `[${nombrePanel()}] ${nuevas.length} alerta(s) nueva(s) en ${canal.nombre}`,
        texto: nuevas.map((a) => `- ${a.gravedad === "grave" ? "⚠ " : ""}${a.mensaje}`).join("\n"),
      });
      await db.alerta.updateMany({ where: { canalId, clave: { in: nuevas.map((a) => a.clave) }, cerradaEn: null }, data: { notificadaEn: ahora } });
    } catch (e) {
      await registrarActividad(db, { canalId, accion: "aviso_equipo", resumen: `No se pudo avisar de alertas nuevas: ${e instanceof Error ? e.message : e}` });
    }
  }
  return { abiertas: calculadas.length, nuevas: nuevas.length, cerradas: resueltas.length };
}

/** Alertas abiertas y las cerradas en los últimos `dias` días. */
export async function alertasDeCanal(db: Db, u: UsuarioSesion, canalId: string, dias = 30) {
  exigir(u, canalId, "ver");
  const desde = new Date(Date.now() - dias * 864e5);
  return db.alerta.findMany({
    where: { canalId, OR: [{ cerradaEn: null }, { cerradaEn: { gte: desde } }] },
    orderBy: [{ cerradaEn: { sort: "asc", nulls: "first" } }, { abiertaEn: "desc" }],
    select: { id: true, tipo: true, mensaje: true, gravedad: true, abiertaEn: true, cerradaEn: true, video: { select: { id: true, titulo: true } } },
  });
}

/** Conteo de alertas abiertas por canal (vista Red). */
export async function alertasAbiertasPorCanal(db: Db, canalIds: string[]) {
  if (canalIds.length === 0) return new Map<string, { total: number; graves: number }>();
  const filas = await db.alerta.groupBy({ by: ["canalId", "gravedad"], where: { canalId: { in: canalIds }, cerradaEn: null }, _count: { _all: true } });
  const m = new Map<string, { total: number; graves: number }>();
  for (const f of filas) {
    const x = m.get(f.canalId) ?? { total: 0, graves: 0 };
    x.total += f._count._all;
    if (f.gravedad === "grave") x.graves += f._count._all;
    m.set(f.canalId, x);
  }
  return m;
}

// ─────────────────────────── Resumen semanal ───────────────────────────

export const TIPO_RESUMEN = "resumen_semanal";
export const TIPO_INVESTIGACION = "investigacion";

/** Genera (o regenera, si sigue en borrador) el resumen de la semana local de `ahora`. */
export async function generarResumenSemanal(db: Db, canalId: string, ahora = new Date(), generadoPorId: string | null = null) {
  const canal = await db.canal.findUniqueOrThrow({ where: { id: canalId } });
  const hoy = fechaLocal(ahora, canal.zonaHoraria);
  const semana = semanaISO(hoy);
  const { lunes, domingo } = limitesSemana(hoy);
  const desde = fechaLocalAUtc(lunes, "00:00", canal.zonaHoraria);
  const hasta = fechaLocalAUtc(domingo, "23:59", canal.zonaHoraria);
  const en7 = new Date(ahora.getTime() + 7 * 864e5);

  const existente = await db.informe.findUnique({ where: { canalId_tipo_semana: { canalId, tipo: TIPO_RESUMEN, semana } } });
  if (existente && existente.estado === "enviado") return existente;

  await sincronizarAlertas(db, canalId, ahora);
  const [videos, alertas, gasto, actividad] = await Promise.all([
    db.video.findMany({
      where: { canalId },
      select: {
        titulo: true,
        estado: true,
        fechaPublicacion: true,
        publicaciones: { select: { metricas: { orderBy: { fecha: "desc" }, take: 1, select: { vistas: true, retencion: true, ctr: true, likes: true, comentarios: true, compartidos: true, suscriptores: true } } } },
      },
    }),
    db.alerta.findMany({ where: { canalId, cerradaEn: null }, select: { mensaje: true, gravedad: true } }),
    db.ejecucion.aggregate({ where: { canalId, creadoEn: { gte: desde, lte: hasta } }, _sum: { costo: true } }),
    db.actividad.count({ where: { canalId, creadoEn: { gte: desde, lte: hasta } } }),
  ]);
  const total = (v: (typeof videos)[number]) => {
    const ultimas = v.publicaciones.flatMap((p) => p.metricas);
    return ultimas.length ? combinarMetricas(ultimas).vistas : null;
  };
  const porEstado: Record<string, number> = {};
  for (const v of videos) porEstado[v.estado] = (porEstado[v.estado] ?? 0) + 1;

  const contenido = textoResumen({
    canal: canal.nombre,
    semana,
    lunes,
    domingo,
    publicados: videos
      .filter((v) => v.estado === "publicado" && v.fechaPublicacion && v.fechaPublicacion >= desde && v.fechaPublicacion <= hasta)
      .map((v) => ({ titulo: v.titulo, fecha: fechaLocal(v.fechaPublicacion!, canal.zonaHoraria), vistas: total(v) })),
    proximos: videos
      .filter((v) => v.fechaPublicacion && v.fechaPublicacion > ahora && v.fechaPublicacion <= en7)
      .sort((a, b) => a.fechaPublicacion!.getTime() - b.fechaPublicacion!.getTime())
      .map((v) => ({ titulo: v.titulo, fecha: fechaLocal(v.fechaPublicacion!, canal.zonaHoraria), estado: v.estado })),
    porEstado,
    alertas,
    mejores: videos
      .map((v) => ({ titulo: v.titulo, vistas: total(v) }))
      .filter((x): x is { titulo: string; vistas: number } => x.vistas !== null)
      .sort((a, b) => b.vistas - a.vistas)
      .slice(0, 3),
    gastoSemana: Number(gasto._sum.costo ?? 0),
    actividad,
  });

  const datos = { titulo: `Resumen semanal ${semana}`, contenido, generadoPorId, estado: "borrador" as const };
  const informe = existente
    ? await db.informe.update({ where: { id: existente.id }, data: datos })
    : await db.informe.create({ data: { canalId, tipo: TIPO_RESUMEN, semana, ...datos } });
  return informe;
}

export async function aprobarYEnviarResumen(
  db: Db,
  u: UsuarioSesion,
  canalId: string,
  informeId: string,
  datos: { contenido: string; confirmo: boolean },
) {
  exigir(u, canalId, "configurar_canal", "Solo un admin del canal aprueba y envía el resumen.");
  if (!datos.confirmo) throw new DatoInvalido("Marca la casilla de confirmación para continuar.");
  const inf = await db.informe.findFirst({ where: { id: informeId, canalId, tipo: TIPO_RESUMEN } });
  if (!inf) throw new NoEncontrado("Resumen no encontrado.");
  if (inf.estado === "enviado") throw new DatoInvalido("Este resumen ya se envió.");
  const contenido = datos.contenido.replace(/\r\n/g, "\n").trim();
  if (!contenido) throw new DatoInvalido("El resumen está vacío.");

  await db.informe.update({ where: { id: inf.id }, data: { contenido, aprobadoPorId: u.id, aprobadoEn: new Date() } });
  const resultado = await avisarEquipo(db, { canalId, userId: u.id, asunto: inf.titulo, texto: contenido });
  const fallo = resultado.startsWith("No se pudo");
  await db.informe.update({ where: { id: inf.id }, data: fallo ? { estado: "error" } : { estado: "enviado", enviadoEn: new Date() } });
  await registrarActividad(db, { canalId, userId: u.id, accion: "aviso_equipo", resumen: `${inf.titulo}: ${fallo ? "falló el envío" : "aprobado y enviado al equipo"}` });
  if (fallo) throw new DatoInvalido(resultado);
}

// ─────────────────────────── Investigación ───────────────────────────

export function topeInvestigacion(reglas: unknown): number {
  const v = (reglas as { limiteGastoInvestigacion?: unknown } | null)?.limiteGastoInvestigacion;
  return typeof v === "number" && v >= 0 ? v : 3;
}

export async function generarInvestigacion(
  db: Db,
  canalId: string,
  investigar: Investigador,
  opciones: { ahora?: Date; datosVidiq?: string | null; generadoPorId?: string | null } = {},
) {
  const ahora = opciones.ahora ?? new Date();
  const canal = await db.canal.findUniqueOrThrow({ where: { id: canalId } });
  const semana = semanaISO(fechaLocal(ahora, canal.zonaHoraria));
  const recientes = await db.video.findMany({ where: { canalId }, orderBy: { fechaPublicacion: "desc" }, take: 12, select: { titulo: true } });
  const reglas = (canal.reglas ?? {}) as Record<string, unknown>;
  const pedido = {
    canal: { nombre: canal.nombre, idioma: canal.idioma, pilares: leerPilares(canal.pilares), voz: Array.isArray(reglas.voz) ? (reglas.voz as string[]) : [] },
    titulosRecientes: recientes.map((r) => r.titulo),
    datosVidiq: opciones.datosVidiq?.trim() || null,
    semana,
  };
  const { system, usuario } = promptInvestigacion(pedido);
  const maximo = costoMaximoInvestigacion(system.length + usuario.length);
  const tope = topeInvestigacion(canal.reglas);
  if (maximo > tope) {
    throw new TopeExcedido(`El peor caso de la investigación (US$ ${maximo.toFixed(2)}) supera el tope del canal (US$ ${tope.toFixed(2)}). Un admin puede subir «limiteGastoInvestigacion».`);
  }
  await exigirTopeMensual(db, canalId, maximo, ahora);

  const ej = await db.ejecucion.create({
    data: { canalId, tipo: "investigacion", estado: "en_curso", registradoPorId: opciones.generadoPorId ?? null, log: `Semana ${semana}. Modelo pedido: ${MODELO_GUION}` },
  });
  try {
    const r = await investigar(pedido);
    const datos = {
      titulo: `Investigación de referencias ${semana}`,
      contenido: r.informe,
      estado: "borrador" as const,
      costo: r.costo,
      ejecucionId: ej.id,
      generadoPorId: opciones.generadoPorId ?? null,
      datos: { modelo: r.modelo, busquedas: r.busquedas, vidiq: Boolean(pedido.datosVidiq) } as Prisma.InputJsonValue,
    };
    const informe = await db.informe.upsert({
      where: { canalId_tipo_semana: { canalId, tipo: TIPO_INVESTIGACION, semana } },
      create: { canalId, tipo: TIPO_INVESTIGACION, semana, ...datos },
      update: datos,
    });
    await db.ejecucion.update({
      where: { id: ej.id },
      data: {
        estado: "ok",
        costo: r.costo,
        log: [`Modelo: ${r.modelo}`, `Tokens: ${r.uso.input_tokens} de entrada, ${r.uso.output_tokens} de salida`, `Búsquedas web: ${r.busquedas}`, `Costo: US$ ${r.costo.toFixed(4)}${r.estimado ? " (estimado)" : ""}`, pedido.datosVidiq ? "Con datos de vidIQ del equipo" : "Sin datos de vidIQ"].join("\n"),
      },
    });
    return informe;
  } catch (e) {
    await db.ejecucion.update({ where: { id: ej.id }, data: { estado: "error", log: `Error: ${e instanceof Error ? e.message : e}`.slice(0, 20_000) } });
    if (e instanceof ErrorGenerador) throw new DatoInvalido(e.message);
    throw new DatoInvalido("No se pudo generar la investigación. El error quedó en ejecuciones.");
  }
}

export async function investigarAhora(db: Db, u: UsuarioSesion, canalId: string, investigar: Investigador, datosVidiq: string | null) {
  exigir(u, canalId, "configurar_canal", "Solo un admin del canal lanza la investigación.");
  return generarInvestigacion(db, canalId, investigar, { datosVidiq, generadoPorId: u.id });
}

export async function resumenAhora(db: Db, u: UsuarioSesion, canalId: string) {
  exigir(u, canalId, "configurar_canal", "Solo un admin del canal genera el resumen.");
  return generarResumenSemanal(db, canalId, new Date(), u.id);
}

export async function listarInformes(db: Db, u: UsuarioSesion, canalId: string) {
  exigir(u, canalId, "ver");
  return db.informe.findMany({
    where: { canalId },
    orderBy: { creadoEn: "desc" },
    take: 30,
    select: { id: true, tipo: true, semana: true, titulo: true, estado: true, costo: true, creadoEn: true, enviadoEn: true, aprobadoPor: { select: { email: true } } },
  });
}

export async function obtenerInforme(db: Db, u: UsuarioSesion, canalId: string, id: string) {
  exigir(u, canalId, "ver");
  return db.informe.findFirst({ where: { id, canalId }, include: { aprobadoPor: { select: { email: true } }, generadoPor: { select: { email: true } } } });
}

// ─────────────────────────── Tareas del cron ───────────────────────────

export async function tareasDiarias(db: Db, ahora = new Date()) {
  const canales = await db.canal.findMany({ where: { activo: true }, select: { id: true, slug: true } });
  const salida = [];
  for (const c of canales) {
    // Un canal que falla no frena a los demás.
    try {
      salida.push({ canal: c.slug, ok: true, ...(await sincronizarAlertas(db, c.id, ahora)) });
    } catch (e) {
      log.error("cron_diario_canal", { canal: c.slug, error: e });
      salida.push({ canal: c.slug, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return salida;
}

/** Semanal: resumen en borrador (avisa a los admins) e investigación si hay clave de IA. */
export async function tareasSemanales(db: Db, investigar: Investigador | null, ahora = new Date()) {
  const canales = await db.canal.findMany({ where: { activo: true }, select: { id: true, slug: true, nombre: true, reglas: true } });
  const salida: { canal: string; resumen: string; investigacion: string }[] = [];
  for (const c of canales) {
    let r: Awaited<ReturnType<typeof generarResumenSemanal>>;
    try {
      r = await generarResumenSemanal(db, c.id, ahora);
    } catch (e) {
      log.error("cron_semanal_resumen", { canal: c.slug, error: e });
      salida.push({ canal: c.slug, resumen: `error: ${e instanceof Error ? e.message : e}`, investigacion: "omitida" });
      continue;
    }
    let inv = "omitida";
    const quiere = (c.reglas as { investigacionSemanal?: unknown } | null)?.investigacionSemanal !== false;
    if (investigar && quiere) {
      try {
        await generarInvestigacion(db, c.id, investigar, { ahora });
        inv = "ok";
      } catch (e) {
        inv = `error: ${e instanceof Error ? e.message : e}`;
        log.aviso("cron_semanal_investigacion", { canal: c.slug, error: e });
      }
    }
    try {
      await enviarCorreo({
        para: await correosAdmins(db, c.id),
        asunto: `[${nombrePanel()}] ${r.titulo} listo para revisar · ${c.nombre}`,
        texto: `El resumen semanal quedó en borrador. Revísalo y apruébalo en el panel (Informes) para enviarlo al equipo.${inv === "ok" ? "\nTambién está lista la investigación de referencias de la semana." : ""}`,
      });
    } catch (e) {
      // El borrador queda en el panel aunque el aviso no salga.
      log.aviso("cron_semanal_aviso", { canal: c.slug, error: e });
    }
    salida.push({ canal: c.slug, resumen: r.estado, investigacion: inv });
  }
  return salida;
}
