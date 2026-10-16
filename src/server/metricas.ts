// Capa de acceso de publicaciones, métricas, integraciones y eventos.
// Igual que acceso.ts: cada función recibe el usuario, comprueba el permiso
// y filtra por canal_id. Las páginas nunca consultan Prisma directamente.

import type { Db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { puede, type Accion } from "@/lib/dominio/roles";
import { enlaceCanonico, reconocerEnlace, idDeYoutube, idDeTiktok, type Plataforma } from "@/lib/dominio/plataformas";
import { fechaLocal } from "@/lib/dominio/fechas";
import { leerMetricasCsv } from "@/lib/metricas/csv";
import { emparejar } from "@/lib/metricas/emparejar";
import { calcularResultados, celdaCsv, combinarMetricas, type MetricaTotal, type VideoConMetricas } from "@/lib/metricas/resultados";
import { AccesoDenegado, NoEncontrado, TransicionInvalida, type UsuarioSesion } from "./acceso";

export class DatoInvalido extends TransicionInvalida {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "DatoInvalido";
  }
}

function exigir(usuario: UsuarioSesion, canalId: string, accion: Accion, mensaje?: string) {
  if (!puede(usuario, canalId, accion)) throw new AccesoDenegado(mensaje);
}

/** «YYYY-MM-DD» → Date a medianoche UTC (columna DATE). */
const aDia = (fecha: string) => new Date(`${fecha}T00:00:00Z`);

// ─────────────────────────── Publicaciones ───────────────────────────

export async function registrarPublicacion(
  db: Db,
  usuario: UsuarioSesion,
  canalId: string,
  datos: { videoId: string; enlace: string; plataforma?: Plataforma; publicada?: Date | null },
) {
  exigir(usuario, canalId, "editar_video", "Tu rol no permite registrar publicaciones.");
  const video = await db.video.findFirst({ where: { id: datos.videoId, canalId }, select: { id: true } });
  if (!video) throw new NoEncontrado("Video no encontrado en este canal.");

  const reconocido = reconocerEnlace(datos.enlace);
  if (!reconocido) throw new DatoInvalido("No reconozco el enlace. Pega la URL del video en YouTube o TikTok.");
  // Si el usuario eligió Shorts para un enlace normal de YouTube, se respeta su elección.
  const plataforma =
    datos.plataforma && (datos.plataforma === "tiktok") === (reconocido.plataforma === "tiktok")
      ? datos.plataforma
      : reconocido.plataforma;

  const existente = await db.publicacion.findFirst({
    where: { canalId, plataforma, externoId: reconocido.externoId },
    select: { id: true, videoId: true },
  });
  if (existente && existente.videoId !== video.id) {
    throw new DatoInvalido("Ese enlace ya está registrado en otro video del canal.");
  }
  const data = {
    url: enlaceCanonico(plataforma, reconocido.externoId),
    publicada: datos.publicada ?? null,
  };
  return existente
    ? db.publicacion.update({ where: { id: existente.id }, data })
    : db.publicacion.create({ data: { canalId, videoId: video.id, plataforma, externoId: reconocido.externoId, ...data } });
}

export async function quitarPublicacion(db: Db, usuario: UsuarioSesion, canalId: string, publicacionId: string) {
  exigir(usuario, canalId, "editar_video", "Tu rol no permite quitar publicaciones.");
  const { count } = await db.publicacion.deleteMany({ where: { id: publicacionId, canalId } });
  if (count === 0) throw new NoEncontrado("Publicación no encontrada.");
}

// ─────────────────────────── Métricas ───────────────────────────

export type ValoresMetrica = Partial<Omit<MetricaTotal, never>>;

const CAMPOS: (keyof MetricaTotal)[] = ["vistas", "retencion", "ctr", "likes", "comentarios", "compartidos", "suscriptores"];

function validarValores(v: ValoresMetrica) {
  for (const k of CAMPOS) {
    const n = v[k];
    if (n === undefined || n === null) continue;
    if (!Number.isFinite(n) || n < 0) throw new DatoInvalido(`${k}: debe ser un número positivo.`);
    if ((k === "retencion" || k === "ctr") && n > 100) throw new DatoInvalido(`${k}: es un porcentaje (0 a 100).`);
  }
}

/** Guarda (o completa) la foto de una publicación en una fecha. Solo pisa los campos que trae. */
async function guardarFoto(
  db: Db,
  canalId: string,
  publicacionId: string,
  fecha: string,
  valores: ValoresMetrica,
  fuente: "youtube_api" | "csv" | "manual",
) {
  validarValores(valores);
  const definidos = Object.fromEntries(CAMPOS.filter((k) => valores[k] != null).map((k) => [k, valores[k]]));
  if (Object.keys(definidos).length === 0) return null;
  return db.metrica.upsert({
    where: { publicacionId_fecha: { publicacionId, fecha: aDia(fecha) } },
    create: { canalId, publicacionId, fecha: aDia(fecha), fuente, ...definidos },
    update: { fuente, ...definidos },
  });
}

export { guardarFoto as guardarFotoInterna };

export async function guardarMetricaManual(
  db: Db,
  usuario: UsuarioSesion,
  canalId: string,
  publicacionId: string,
  fecha: string,
  valores: ValoresMetrica,
) {
  exigir(usuario, canalId, "editar_video", "Tu rol no permite cargar métricas.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new DatoInvalido("Fecha inválida.");
  const pub = await db.publicacion.findFirst({ where: { id: publicacionId, canalId }, select: { id: true } });
  if (!pub) throw new NoEncontrado("Publicación no encontrada.");
  const r = await guardarFoto(db, canalId, pub.id, fecha, valores, "manual");
  if (!r) throw new DatoInvalido("Escribe al menos una métrica.");
  return r;
}

export type ResumenCsv = { guardadas: number; creadas: number; sinEmparejar: string[]; avisos: string[] };

/**
 * Importa un CSV de métricas a una plataforma del canal. Cada fila se asocia a
 * una publicación por enlace/id; si no hay, por título del video (solo si la
 * coincidencia es única). Nunca crea videos.
 */
export async function importarMetricasCsv(
  db: Db,
  usuario: UsuarioSesion,
  canalId: string,
  texto: string,
  opciones: { plataforma: Plataforma; fechaPorDefecto: string },
): Promise<ResumenCsv> {
  exigir(usuario, canalId, "editar_video", "Tu rol no permite cargar métricas.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opciones.fechaPorDefecto)) throw new DatoInvalido("Fecha inválida.");
  const { filas, avisos } = leerMetricasCsv(texto);
  const resumen: ResumenCsv = { guardadas: 0, creadas: 0, sinEmparejar: [], avisos: [...avisos] };
  if (filas.length === 0) return resumen;

  const tiktok = opciones.plataforma === "tiktok";
  const videos = await db.video.findMany({
    where: { canalId },
    select: { id: true, titulo: true, publicaciones: { where: { plataforma: opciones.plataforma }, select: { id: true, externoId: true } } },
  });

  for (const fila of filas) {
    const externoId = fila.referencia ? (tiktok ? idDeTiktok(fila.referencia) : idDeYoutube(fila.referencia)) : null;
    let pubId = externoId
      ? videos.flatMap((v) => v.publicaciones).find((p) => p.externoId === externoId)?.id
      : undefined;

    if (!pubId && fila.titulo) {
      const video = emparejar(fila.titulo, videos);
      if (video?.publicaciones.length === 1) pubId = video.publicaciones[0].id;
      else if (video && video.publicaciones.length === 0 && externoId) {
        const nueva = await db.publicacion.create({
          data: {
            canalId,
            videoId: video.id,
            plataforma: opciones.plataforma,
            externoId,
            url: enlaceCanonico(opciones.plataforma, externoId),
          },
        });
        video.publicaciones.push({ id: nueva.id, externoId });
        pubId = nueva.id;
        resumen.creadas++;
      }
    }
    if (!pubId) {
      resumen.sinEmparejar.push(fila.titulo ?? fila.referencia ?? "(fila sin identificar)");
      continue;
    }
    try {
      const r = await guardarFoto(db, canalId, pubId, fila.fecha ?? opciones.fechaPorDefecto, fila, "csv");
      if (r) resumen.guardadas++;
    } catch (e) {
      if (e instanceof DatoInvalido) resumen.avisos.push(`${fila.titulo ?? fila.referencia}: ${e.message}`);
      else throw e;
    }
  }
  return resumen;
}

// ─────────────────────────── Lectura y resultados ───────────────────────────

const SELECT_METRICA = {
  fecha: true,
  vistas: true,
  retencion: true,
  ctr: true,
  likes: true,
  comentarios: true,
  compartidos: true,
  suscriptores: true,
  fuente: true,
} satisfies Prisma.MetricaSelect;

export async function estadisticasDeCanal(db: Db, usuario: UsuarioSesion, canalId: string) {
  exigir(usuario, canalId, "ver");
  const canal = await db.canal.findUniqueOrThrow({ where: { id: canalId }, select: { zonaHoraria: true } });
  const videos = await db.video.findMany({
    where: { canalId },
    orderBy: [{ fechaPublicacion: "asc" }, { creadoEn: "asc" }],
    select: {
      id: true,
      titulo: true,
      pilar: true,
      gancho: true,
      scoreGancho: true,
      estado: true,
      fechaPublicacion: true,
      publicaciones: {
        where: { canalId },
        orderBy: { creadoEn: "asc" },
        select: {
          id: true,
          plataforma: true,
          url: true,
          publicada: true,
          metricas: { where: { canalId }, orderBy: { fecha: "asc" }, select: SELECT_METRICA },
        },
      },
    },
  });

  const conTotales = videos.map((v) => {
    const publicaciones = v.publicaciones.map((p) => ({ ...p, ultima: p.metricas.at(-1) ?? null }));
    const ultimas = publicaciones.flatMap((p) => (p.ultima ? [p.ultima] : []));
    return { ...v, publicaciones, total: ultimas.length ? combinarMetricas(ultimas) : null };
  });

  const paraResultados: VideoConMetricas[] = conTotales
    .filter((v) => v.total)
    .map((v) => ({ ...v, total: v.total! }));

  return {
    videos: conTotales,
    resultados: calcularResultados(paraResultados, canal.zonaHoraria),
  };
}

/** CSV con la última foto de cada publicación (UTF-8 con BOM para Excel). */
export async function exportarEstadisticasCsv(db: Db, usuario: UsuarioSesion, canalId: string): Promise<string> {
  const { videos } = await estadisticasDeCanal(db, usuario, canalId);
  const canal = await db.canal.findUniqueOrThrow({ where: { id: canalId }, select: { zonaHoraria: true } });
  const cab = [
    "video", "pilar", "estado", "fecha_publicacion", "plataforma", "url", "fecha_metrica",
    "vistas", "retencion_pct", "ctr_pct", "likes", "comentarios", "compartidos", "suscriptores", "fuente",
  ];
  const filas = [cab.join(",")];
  for (const v of videos) {
    const base = [v.titulo, v.pilar, v.estado, v.fechaPublicacion ? fechaLocal(v.fechaPublicacion, canal.zonaHoraria) : null];
    if (v.publicaciones.length === 0) {
      filas.push([...base, ...Array(cab.length - base.length).fill(null)].map(celdaCsv).join(","));
      continue;
    }
    for (const p of v.publicaciones) {
      const m = p.ultima;
      filas.push(
        [
          ...base,
          p.plataforma,
          p.url,
          m ? m.fecha.toISOString().slice(0, 10) : null,
          m?.vistas, m?.retencion, m?.ctr, m?.likes, m?.comentarios, m?.compartidos, m?.suscriptores, m?.fuente,
        ]
          .map(celdaCsv)
          .join(","),
      );
    }
  }
  return "﻿" + filas.join("\r\n") + "\r\n";
}

// ─────────────────────────── Integraciones ───────────────────────────

export async function integracionDeCanal(db: Db, usuario: UsuarioSesion, canalId: string) {
  exigir(usuario, canalId, "ver");
  return db.integracion.findUnique({
    where: { canalId_proveedor: { canalId, proveedor: "google" } },
    select: {
      id: true,
      cuenta: true,
      youtubeCanalId: true,
      calendarioId: true,
      ultimaSincronizacion: true,
      ultimoError: true,
      creadoEn: true,
      conectadoPor: { select: { email: true } },
    },
  });
}

export async function cambiarCalendario(db: Db, usuario: UsuarioSesion, canalId: string, calendarioId: string) {
  exigir(usuario, canalId, "configurar_canal", "Solo un admin del canal puede cambiar el calendario.");
  const id = calendarioId.trim();
  if (!id || id.length > 255) throw new DatoInvalido("Indica el id del calendario (o «primary»).");
  const { count } = await db.integracion.updateMany({ where: { canalId, proveedor: "google" }, data: { calendarioId: id } });
  if (count === 0) throw new NoEncontrado("El canal no tiene Google conectado.");
}

export async function desconectarGoogle(db: Db, usuario: UsuarioSesion, canalId: string) {
  exigir(usuario, canalId, "configurar_canal", "Solo un admin del canal puede desconectar Google.");
  const integ = await db.integracion.findUnique({ where: { canalId_proveedor: { canalId, proveedor: "google" } } });
  if (!integ) throw new NoEncontrado("El canal no tiene Google conectado.");
  await db.integracion.delete({ where: { id: integ.id } });
  return integ.refreshTokenCifrado;
}

export async function eventosDeCanal(db: Db, usuario: UsuarioSesion, canalId: string, desde: Date, hasta: Date) {
  exigir(usuario, canalId, "ver");
  return db.eventoCalendario.findMany({
    where: { canalId, origen: "google", inicio: { gte: desde, lt: hasta } },
    orderBy: { inicio: "asc" },
    select: { id: true, titulo: true, inicio: true, fin: true, todoElDia: true },
  });
}

export function esErrorPrismaUnico(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Ficha de un video con sus publicaciones y la serie de métricas de cada una. */
export async function fichaDeVideo(db: Db, usuario: UsuarioSesion, canalId: string, videoId: string) {
  exigir(usuario, canalId, "ver");
  return db.video.findFirst({
    where: { id: videoId, canalId },
    select: {
      id: true,
      titulo: true,
      pilar: true,
      estado: true,
      gancho: true,
      scoreGancho: true,
      puntajeGancho: true,
      revisionTitulo: true,
      textoMiniatura: true,
      ganchoForzadoEn: true,
      ganchoForzadoPor: { select: { email: true } },
      limiteGasto: true,
      notas: true,
      fuentesOk: true,
      fechaPublicacion: true,
      aprobadoEn: true,
      aprobadoPor: { select: { name: true, email: true } },
      publicaciones: {
        where: { canalId },
        orderBy: { creadoEn: "asc" },
        select: {
          id: true,
          plataforma: true,
          url: true,
          publicada: true,
          metricas: { where: { canalId }, orderBy: { fecha: "asc" }, select: SELECT_METRICA },
        },
      },
    },
  });
}
