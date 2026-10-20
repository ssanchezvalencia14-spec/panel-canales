// Canales vinculados por enlace: alta, sincronización de datos públicos de
// YouTube y consultas globales (calendario y estadísticas de toda la red).
// Igual que acceso.ts: toda lectura se filtra por los canales que el usuario ve.

import type { Db } from "@/lib/db";
import { insertarCanal } from "@/lib/canales";
import { diasProduccion, mesVecino, sumarDias } from "@/lib/dominio/calendario";
import { construirMesGlobal, type DiaGlobal } from "@/lib/dominio/calendario-global";
import { colorSeguro } from "@/lib/dominio/canal-config";
import { fechaLocal } from "@/lib/dominio/fechas";
import { rolParaCanalNuevo } from "@/lib/dominio/equipo";
import { puedeAdministrarRed, type Rol } from "@/lib/dominio/roles";
import { log } from "@/lib/log";
import { acentoPanel } from "@/lib/panel";
import { configDeCanalPublico } from "@/lib/youtube/canal-nuevo";
import { cambio, sumarSeries, vistasRecientes, type FotoCanal } from "@/lib/youtube/estadisticas";
import { claveYoutubeDesdeEntorno, FaltaClaveYoutube, YoutubePublico, type Fetch } from "@/lib/youtube/publico";
import { AccesoDenegado, listarCanales, NoEncontrado, TransicionInvalida, type UsuarioSesion } from "./acceso";

export class CanalYaVinculado extends TransicionInvalida {
  constructor(nombre: string) {
    super(`Ese canal de YouTube ya está en el panel: «${nombre}».`);
    this.name = "CanalYaVinculado";
  }
}

type Deps = { fetch?: Fetch; ahora?: Date; yt?: YoutubePublico };

function cliente(deps: Deps): YoutubePublico {
  if (deps.yt) return deps.yt;
  const clave = claveYoutubeDesdeEntorno();
  if (!clave) throw new FaltaClaveYoutube();
  return new YoutubePublico(clave, deps.fetch);
}

/** «YYYY-MM-DD» → Date a medianoche UTC (columna DATE). */
const aDia = (fecha: string) => new Date(`${fecha}T00:00:00Z`);
const aNumero = (v: bigint | number | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));

// ─────────────────────────── Sincronización ───────────────────────────

export type ResultadoSync = { canalId: string; slug: string; ok: boolean; videos: number; error?: string };

/** Lee los datos públicos del canal y los guarda (totales, videos recientes y foto del día). */
export async function sincronizarCanalPublico(db: Db, canalId: string, deps: Deps & { videosMax?: number } = {}): Promise<ResultadoSync> {
  const canal = await db.canal.findUniqueOrThrow({ where: { id: canalId } });
  const base = { canalId, slug: canal.slug };
  if (!canal.youtubeCanalId) return { ...base, ok: false, videos: 0, error: "El canal no tiene enlace de YouTube." };

  try {
    const yt = cliente(deps);
    const ahora = deps.ahora ?? new Date();
    const t = await yt.totales(canal.youtubeCanalId);
    const videos = t.listaSubidas ? await yt.videosRecientes(t.listaSubidas, deps.videosMax ?? 50) : [];

    await db.canal.update({
      where: { id: canalId },
      data: {
        suscriptores: t.suscriptores,
        vistasTotales: t.vistasTotales === null ? null : BigInt(Math.round(t.vistasTotales)),
        videosTotales: t.videosTotales,
        avatarUrl: t.avatarUrl ?? canal.avatarUrl,
        youtubeHandle: t.handle ?? canal.youtubeHandle,
        statsActualizadasEn: ahora,
        statsError: null,
      },
    });

    for (const v of videos) {
      const datos = {
        titulo: v.titulo,
        miniaturaUrl: v.miniaturaUrl,
        publicadoEn: v.publicadoEn,
        duracionSeg: v.duracionSeg,
        vistas: v.vistas,
        likes: v.likes,
        comentarios: v.comentarios,
      };
      await db.videoYoutube.upsert({
        where: { canalId_youtubeId: { canalId, youtubeId: v.id } },
        create: { canalId, youtubeId: v.id, ...datos },
        update: datos,
      });
    }

    const fecha = aDia(fechaLocal(ahora, canal.zonaHoraria));
    const foto = {
      suscriptores: t.suscriptores,
      vistasTotales: t.vistasTotales === null ? null : BigInt(Math.round(t.vistasTotales)),
      videosTotales: t.videosTotales,
    };
    await db.canalSnapshot.upsert({
      where: { canalId_fecha: { canalId, fecha } },
      create: { canalId, fecha, ...foto },
      update: foto,
    });
    return { ...base, ok: true, videos: videos.length };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    log.aviso("youtube_publico_fallo", { canalId, error: e });
    await db.canal.update({ where: { id: canalId }, data: { statsError: mensaje.slice(0, 500) } });
    return { ...base, ok: false, videos: 0, error: mensaje };
  }
}

/**
 * Sincroniza los canales vinculados cuyos datos tienen más de `minutos` minutos
 * (para no gastar la cuota diaria gratuita de YouTube). `ids` limita a ciertos canales.
 */
export async function sincronizarCanalesPublicos(
  db: Db,
  opciones: { ids?: readonly string[]; minutos?: number } & Deps = {},
): Promise<ResultadoSync[]> {
  const ahora = opciones.ahora ?? new Date();
  const limite = new Date(ahora.getTime() - (opciones.minutos ?? 0) * 60_000);
  const canales = await db.canal.findMany({
    where: {
      activo: true,
      youtubeCanalId: { not: null },
      ...(opciones.ids ? { id: { in: [...opciones.ids] } } : {}),
      OR: [{ statsActualizadasEn: null }, { statsActualizadasEn: { lt: limite } }],
    },
    select: { id: true },
  });
  const salida: ResultadoSync[] = [];
  for (const c of canales) salida.push(await sincronizarCanalPublico(db, c.id, opciones));
  return salida;
}

/** «Actualizar ahora»: refresca los canales que ve el usuario (mín. 5 minutos entre lecturas del mismo canal). */
export async function actualizarCanalesVisibles(db: Db, usuario: UsuarioSesion, deps: Deps = {}): Promise<ResultadoSync[]> {
  const canales = await listarCanales(db, usuario);
  return sincronizarCanalesPublicos(db, { ...deps, ids: canales.map((c) => c.id), minutos: 5 });
}

// ─────────────────────────── Vincular por enlace ───────────────────────────

/**
 * Vincula un canal de YouTube pegando su enlace. Si `canalSlug` es de un canal
 * que ya existe en el panel, le asocia el enlace; si no, crea un canal nuevo.
 * Solo el superadmin de red.
 */
/**
 * Da acceso a un canal recién creado al equipo actual de la red: cada persona
 * activa con algún rol recibe el rol que más tiene (con empate, el de menos
 * permisos). Sin esto, solo el superadmin vería el canal nuevo.
 */
export async function darAccesoAlEquipo(db: Db, canalId: string): Promise<number> {
  const membresias = await db.membresia.findMany({
    where: { canalId: { not: canalId }, user: { activo: true, esSuperadmin: false } },
    select: { userId: true, rol: true },
  });
  const porPersona = new Map<string, Rol[]>();
  for (const m of membresias) porPersona.set(m.userId, [...(porPersona.get(m.userId) ?? []), m.rol]);
  const data = [...porPersona.entries()].flatMap(([userId, roles]) => {
    const rol = rolParaCanalNuevo(roles);
    return rol ? [{ userId, canalId, rol }] : [];
  });
  if (data.length === 0) return 0;
  const { count } = await db.membresia.createMany({ data, skipDuplicates: true });
  return count;
}

export async function vincularCanalPorEnlace(
  db: Db,
  usuario: UsuarioSesion,
  enlace: string,
  opciones: { canalSlug?: string; darAccesoEquipo?: boolean } = {},
  deps: Deps = {},
) {
  if (!puedeAdministrarRed(usuario)) throw new AccesoDenegado("Solo un superadmin de red puede vincular canales.");
  const yt = cliente(deps);
  const publico = await yt.resolver(enlace);

  const ya = await db.canal.findUnique({ where: { youtubeCanalId: publico.id }, select: { nombre: true } });
  if (ya) throw new CanalYaVinculado(ya.nombre);

  const vinculo = { youtubeCanalId: publico.id, youtubeHandle: publico.handle, avatarUrl: publico.avatarUrl };
  let canalId: string;
  let slug: string;
  let nombre: string;
  let equipo = 0;
  if (opciones.canalSlug) {
    const existente = await db.canal.findUnique({ where: { slug: opciones.canalSlug }, select: { id: true, slug: true, nombre: true, youtubeCanalId: true } });
    if (!existente) throw new NoEncontrado("Canal no encontrado.");
    if (existente.youtubeCanalId) throw new TransicionInvalida(`«${existente.nombre}» ya tiene un canal de YouTube vinculado.`);
    await db.canal.update({ where: { id: existente.id }, data: vinculo });
    ({ id: canalId, slug, nombre } = existente);
  } else {
    const existentes = await db.canal.findMany({ select: { slug: true } });
    const config = configDeCanalPublico(publico, { slugsUsados: new Set(existentes.map((c) => c.slug)), cantidadCanales: existentes.length });
    const creado = await insertarCanal(db, config);
    await db.canal.update({ where: { id: creado.id }, data: vinculo });
    ({ id: canalId, slug, nombre } = creado);
    if (opciones.darAccesoEquipo !== false) equipo = await darAccesoAlEquipo(db, canalId);
  }

  // Primera lectura con más historial; si falla (p. ej. cuota), el canal queda creado igual.
  const sync = await sincronizarCanalPublico(db, canalId, { ...deps, yt, videosMax: 100 });
  return { canalId, slug, nombre, sync, equipo };
}

// ─────────────────────────── Consultas globales ───────────────────────────

export type TarjetaCanal = {
  slug: string;
  nombre: string;
  color: string;
  avatarUrl: string | null;
  handle: string | null;
  vinculado: boolean;
  suscriptores: number | null;
  vistasTotales: number | null;
  videosTotales: number | null;
  subs7: number | null;
  subs28: number | null;
  vistasRecientes: number;
  videosRecientes: number;
  actualizadoEn: Date | null;
  error: string | null;
};

export type VideoDestacado = {
  canalSlug: string;
  canalNombre: string;
  color: string;
  youtubeId: string;
  titulo: string;
  miniaturaUrl: string | null;
  publicadoEn: Date;
  duracionSeg: number | null;
  vistas: number | null;
  likes: number | null;
  comentarios: number | null;
};

export type EstadisticasGlobales = {
  /** Todos los canales visibles (para el filtro), aunque haya uno seleccionado. */
  filtro: { slug: string; nombre: string }[];
  tarjetas: TarjetaCanal[];
  totales: {
    canales: number;
    vinculados: number;
    suscriptores: number | null;
    vistasTotales: number | null;
    videosTotales: number | null;
    subs7: number | null;
    subs28: number | null;
    vistasRecientes: number;
    videosRecientes: number;
  };
  serieSuscriptores: { fecha: string; valor: number }[];
  masVistos: VideoDestacado[];
  recientes: VideoDestacado[];
  actualizadoEn: Date | null;
};

const suma = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

/** Estadísticas de toda la red (o de un canal si se pasa `slug`), con las cifras públicas de YouTube. */
export async function estadisticasGlobales(db: Db, usuario: UsuarioSesion, opciones: { slug?: string; ahora?: Date } = {}): Promise<EstadisticasGlobales> {
  const ahora = opciones.ahora ?? new Date();
  const visibles = await listarCanales(db, usuario);
  const elegidos = opciones.slug ? visibles.filter((c) => c.slug === opciones.slug) : visibles;
  const ids = elegidos.map((c) => c.id);
  const filtro = visibles.map((c) => ({ slug: c.slug, nombre: c.nombre }));

  const vacio: EstadisticasGlobales = {
    filtro,
    tarjetas: [],
    totales: { canales: 0, vinculados: 0, suscriptores: null, vistasTotales: null, videosTotales: null, subs7: null, subs28: null, vistasRecientes: 0, videosRecientes: 0 },
    serieSuscriptores: [],
    masVistos: [],
    recientes: [],
    actualizadoEn: null,
  };
  if (ids.length === 0) return vacio;

  const desde = aDia(sumarDias(ahora.toISOString().slice(0, 10), -120));
  const [snapshots, videos, masVistos, recientes] = await Promise.all([
    db.canalSnapshot.findMany({ where: { canalId: { in: ids }, fecha: { gte: desde } }, orderBy: { fecha: "asc" } }),
    db.videoYoutube.findMany({
      where: { canalId: { in: ids }, publicadoEn: { gte: new Date(ahora.getTime() - 28 * 86_400_000) } },
      select: { canalId: true, publicadoEn: true, vistas: true },
    }),
    db.videoYoutube.findMany({ where: { canalId: { in: ids }, vistas: { not: null } }, orderBy: { vistas: "desc" }, take: 10 }),
    db.videoYoutube.findMany({ where: { canalId: { in: ids } }, orderBy: { publicadoEn: "desc" }, take: 10 }),
  ]);

  const fotosDe = (canalId: string): FotoCanal[] =>
    snapshots
      .filter((s) => s.canalId === canalId)
      .map((s) => ({ fecha: s.fecha.toISOString().slice(0, 10), suscriptores: s.suscriptores, vistasTotales: aNumero(s.vistasTotales) }));

  const tarjetas: TarjetaCanal[] = elegidos.map((c) => {
    const fotos = fotosDe(c.id);
    const rec = vistasRecientes(videos.filter((v) => v.canalId === c.id), 28, ahora);
    return {
      slug: c.slug,
      nombre: c.nombre,
      color: colorSeguro(c.colorAcento, acentoPanel()),
      avatarUrl: c.avatarUrl,
      handle: c.youtubeHandle,
      vinculado: Boolean(c.youtubeCanalId),
      suscriptores: c.suscriptores,
      vistasTotales: aNumero(c.vistasTotales),
      videosTotales: c.videosTotales,
      subs7: cambio(fotos, "suscriptores", 7)?.valor ?? null,
      subs28: cambio(fotos, "suscriptores", 28)?.valor ?? null,
      vistasRecientes: rec.vistas,
      videosRecientes: rec.videos,
      actualizadoEn: c.statsActualizadasEn,
      error: c.statsError,
    };
  });

  const vinculadas = tarjetas.filter((t) => t.vinculado);
  const idsVinculados = elegidos.filter((c) => c.youtubeCanalId).map((c) => c.id);
  const porId = new Map(elegidos.map((c) => [c.id, c]));
  const destacado = (v: (typeof masVistos)[number]): VideoDestacado => {
    const c = porId.get(v.canalId)!;
    return {
      canalSlug: c.slug,
      canalNombre: c.nombre,
      color: colorSeguro(c.colorAcento, acentoPanel()),
      youtubeId: v.youtubeId,
      titulo: v.titulo,
      miniaturaUrl: v.miniaturaUrl,
      publicadoEn: v.publicadoEn,
      duracionSeg: v.duracionSeg,
      vistas: v.vistas,
      likes: v.likes,
      comentarios: v.comentarios,
    };
  };

  return {
    filtro,
    tarjetas,
    totales: {
      canales: tarjetas.length,
      vinculados: vinculadas.length,
      suscriptores: suma(vinculadas.map((t) => t.suscriptores)),
      vistasTotales: suma(vinculadas.map((t) => t.vistasTotales)),
      videosTotales: suma(vinculadas.map((t) => t.videosTotales)),
      subs7: suma(vinculadas.map((t) => t.subs7)),
      subs28: suma(vinculadas.map((t) => t.subs28)),
      vistasRecientes: vinculadas.reduce((s, t) => s + t.vistasRecientes, 0),
      videosRecientes: vinculadas.reduce((s, t) => s + t.videosRecientes, 0),
    },
    serieSuscriptores: sumarSeries(idsVinculados.map(fotosDe), "suscriptores"),
    masVistos: masVistos.map(destacado),
    recientes: recientes.map(destacado),
    actualizadoEn: vinculadas.reduce<Date | null>((a, t) => (t.actualizadoEn && (!a || t.actualizadoEn < a) ? t.actualizadoEn : a), null),
  };
}

export type CalendarioGlobal = {
  filtro: { slug: string; nombre: string; color: string }[];
  semanas: DiaGlobal[][];
  /** Zonas horarias de los canales mostrados (para el pie del calendario). */
  zonas: string[];
  hoy: string;
};

/** Calendario del mes con los videos de todos los canales visibles (o de uno si se pasa `slug`). */
export async function calendarioGlobal(db: Db, usuario: UsuarioSesion, mes: string, opciones: { slug?: string; ahora?: Date } = {}): Promise<CalendarioGlobal> {
  const ahora = opciones.ahora ?? new Date();
  const visibles = await listarCanales(db, usuario);
  const elegidos = opciones.slug ? visibles.filter((c) => c.slug === opciones.slug) : visibles;
  const ids = elegidos.map((c) => c.id);
  const filtro = visibles.map((c) => ({ slug: c.slug, nombre: c.nombre, color: colorSeguro(c.colorAcento, acentoPanel()) }));
  const zonas = [...new Set(elegidos.map((c) => c.zonaHoraria))];
  const hoy = fechaLocal(ahora, elegidos[0]?.zonaHoraria ?? "UTC");
  if (ids.length === 0) return { filtro, semanas: construirMesGlobal(mes, []), zonas, hoy };

  // La grilla muestra días de los meses vecinos y la producción cae días antes de publicar: margen amplio.
  const desde = aDia(sumarDias(`${mes}-01`, -7));
  const hasta = aDia(sumarDias(`${mesVecino(mes, 1)}-01`, 21));
  const [videos, reuniones, publicados] = await Promise.all([
    db.video.findMany({
      where: { canalId: { in: ids }, fechaPublicacion: { gte: desde, lt: hasta } },
      select: { id: true, canalId: true, titulo: true, fechaPublicacion: true },
    }),
    db.eventoCalendario.findMany({
      where: { canalId: { in: ids }, origen: "google", inicio: { gte: desde, lt: hasta } },
      select: { id: true, canalId: true, titulo: true, inicio: true, todoElDia: true },
    }),
    db.videoYoutube.findMany({
      where: { canalId: { in: ids }, publicadoEn: { gte: desde, lt: hasta } },
      select: { youtubeId: true, canalId: true, titulo: true, publicadoEn: true },
    }),
  ]);

  const semanas = construirMesGlobal(
    mes,
    elegidos.map((c) => ({
      canal: { slug: c.slug, nombre: c.nombre, color: colorSeguro(c.colorAcento, acentoPanel()), zona: c.zonaHoraria, diasAntes: diasProduccion(c.reglas) },
      videos: videos.filter((v) => v.canalId === c.id),
      reuniones: reuniones.filter((r) => r.canalId === c.id),
      publicados: publicados.filter((p) => p.canalId === c.id).map((p) => ({ id: p.youtubeId, titulo: p.titulo, publicadoEn: p.publicadoEn })),
    })),
  );
  return { filtro, semanas, zonas, hoy };
}
