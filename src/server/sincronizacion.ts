// Sincronización de un canal con Google (YouTube Analytics + Calendar).
// No comprueba permisos: la llaman la acción «Sincronizar ahora» (que exige
// configurar_canal) y la ruta de cron (protegida con CRON_SECRET).
// Cada corrida queda registrada en `ejecuciones` con su log.

import type { Db } from "@/lib/db";
import { descifrar } from "@/lib/cifrado";
import { diasProduccion, sumarDias } from "@/lib/dominio/calendario";
import { fechaLocal } from "@/lib/dominio/fechas";
import { configOAuthDesdeEntorno, Google, tokenDeAcceso, type ConfigOAuth, type EventoGoogle, type Fetch } from "@/lib/google/cliente";
import { emparejar } from "@/lib/metricas/emparejar";
import { guardarFotoInterna } from "./metricas";
import { log } from "@/lib/log";

export type ResumenSincronizacion = {
  ok: boolean;
  publicacionesNuevas: number;
  metricasGuardadas: number;
  eventosEscritos: number;
  reunionesLeidas: number;
  log: string[];
};

type Dependencias = { fetch?: Fetch; ahora?: Date; oauth?: ConfigOAuth | null };

const MARCA = "panelVideoId";

export async function sincronizarCanal(db: Db, canalId: string, deps: Dependencias = {}): Promise<ResumenSincronizacion> {
  const ahora = deps.ahora ?? new Date();
  const r: ResumenSincronizacion = { ok: false, publicacionesNuevas: 0, metricasGuardadas: 0, eventosEscritos: 0, reunionesLeidas: 0, log: [] };
  const integ = await db.integracion.findUnique({ where: { canalId_proveedor: { canalId, proveedor: "google" } } });
  if (!integ) {
    r.log.push("El canal no tiene Google conectado.");
    return r;
  }
  const canal = await db.canal.findUniqueOrThrow({ where: { id: canalId } });
  const ejecucion = await db.ejecucion.create({ data: { canalId, tipo: "sincronizacion_google", estado: "en_curso" } });

  try {
    const oauth = deps.oauth === undefined ? configOAuthDesdeEntorno() : deps.oauth;
    if (!oauth) throw new Error("Faltan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o AUTH_URL.");
    const token = await tokenDeAcceso(oauth, descifrar(integ.refreshTokenCifrado), deps.fetch);
    const g = new Google(token, deps.fetch);

    // 1) YouTube: emparejar subidas con videos del panel y traer métricas.
    const yt = await g.miCanal();
    if (!yt) {
      r.log.push("La cuenta conectada no tiene canal de YouTube.");
    } else {
      const subidos = await g.videosSubidos(yt.listaSubidas);
      const videos = await db.video.findMany({
        where: { canalId },
        select: { id: true, titulo: true, publicaciones: { where: { plataforma: { in: ["youtube", "youtube_shorts"] } }, select: { externoId: true } } },
      });
      const conocidos = new Set(videos.flatMap((v) => v.publicaciones.map((p) => p.externoId)));
      const sinPublicacion = videos.filter((v) => v.publicaciones.length === 0);
      for (const s of subidos) {
        if (conocidos.has(s.id)) continue;
        const video = emparejar(s.titulo, sinPublicacion);
        if (!video) continue;
        await db.publicacion.create({
          data: { canalId, videoId: video.id, plataforma: "youtube", externoId: s.id, url: `https://www.youtube.com/watch?v=${s.id}`, publicada: s.publicado },
        });
        sinPublicacion.splice(sinPublicacion.indexOf(video), 1);
        r.publicacionesNuevas++;
        r.log.push(`Emparejado «${s.titulo}» → «${video.titulo}».`);
      }

      const pubs = await db.publicacion.findMany({
        where: { canalId, plataforma: { in: ["youtube", "youtube_shorts"] }, externoId: { not: null } },
        select: { id: true, externoId: true, publicada: true },
      });
      const hoy = fechaLocal(ahora, canal.zonaHoraria);
      const desde = pubs
        .map((p) => (p.publicada ? fechaLocal(p.publicada, canal.zonaHoraria) : "2015-01-01"))
        .reduce((a, b) => (a < b ? a : b), hoy);
      for (let i = 0; i < pubs.length; i += 50) {
        const lote = pubs.slice(i, i + 50);
        const metricas = await g.metricasDeVideos(lote.map((p) => p.externoId!), desde, hoy);
        for (const p of lote) {
          const m = metricas.get(p.externoId!);
          if (!m) continue;
          if (await guardarFotoInterna(db, canalId, p.id, hoy, m, "youtube_api")) r.metricasGuardadas++;
        }
      }
      r.log.push(`YouTube: ${pubs.length} publicaciones consultadas, ${r.metricasGuardadas} con métricas.`);
    }

    // 2) Calendar: escribir publicación y producción de cada video con fecha.
    const cal = integ.calendarioId;
    const dias = diasProduccion(canal.reglas);
    const conFecha = await db.video.findMany({
      where: { canalId },
      select: { id: true, titulo: true, fechaPublicacion: true, eventos: { select: { id: true, tipo: true, googleEventId: true } } },
    });
    for (const v of conFecha) {
      const deseados = v.fechaPublicacion ? eventosDeseados(v.id, v.titulo, v.fechaPublicacion, canal.zonaHoraria, dias) : [];
      for (const ev of v.eventos) {
        if (!deseados.some((d) => d.tipo === ev.tipo) && ev.googleEventId) {
          await g.borrarEvento(cal, ev.googleEventId);
          await db.eventoCalendario.delete({ where: { id: ev.id } });
        }
      }
      for (const d of deseados) {
        const previo = v.eventos.find((e) => e.tipo === d.tipo);
        const enGoogle = previo?.googleEventId
          ? await g.actualizarEvento(cal, previo.googleEventId, d.evento).catch(() => g.crearEvento(cal, d.evento))
          : await g.crearEvento(cal, d.evento);
        await db.eventoCalendario.upsert({
          where: { canalId_videoId_tipo: { canalId, videoId: v.id, tipo: d.tipo } },
          create: { canalId, origen: "panel", tipo: d.tipo, videoId: v.id, googleEventId: enGoogle.id, titulo: d.evento.summary, inicio: d.inicio, todoElDia: d.todoElDia },
          update: { googleEventId: enGoogle.id, titulo: d.evento.summary, inicio: d.inicio, todoElDia: d.todoElDia },
        });
        r.eventosEscritos++;
      }
    }

    // 3) Calendar: leer reuniones y otros eventos (los que no escribió el panel).
    const desdeLectura = new Date(ahora.getTime() - 30 * 864e5);
    const hastaLectura = new Date(ahora.getTime() + 120 * 864e5);
    const leidos = (await g.eventos(cal, desdeLectura, hastaLectura)).filter(
      (e) => e.status !== "cancelled" && !e.extendedProperties?.private?.[MARCA],
    );
    for (const e of leidos) {
      const m = momento(e);
      if (!m) continue;
      await db.eventoCalendario.upsert({
        where: { canalId_googleEventId: { canalId, googleEventId: e.id } },
        create: { canalId, origen: "google", tipo: "reunion", googleEventId: e.id, titulo: (e.summary ?? "(sin título)").slice(0, 300), ...m },
        update: { titulo: (e.summary ?? "(sin título)").slice(0, 300), ...m },
      });
    }
    const borrados = await db.eventoCalendario.deleteMany({
      where: { canalId, origen: "google", inicio: { gte: desdeLectura, lt: hastaLectura }, googleEventId: { notIn: leidos.map((e) => e.id) } },
    });
    r.reunionesLeidas = leidos.length;
    r.log.push(`Calendar: ${r.eventosEscritos} eventos escritos, ${leidos.length} leídos, ${borrados.count} quitados.`);

    r.ok = true;
    await db.integracion.update({
      where: { id: integ.id },
      data: { ultimaSincronizacion: ahora, ultimoError: null, ...(yt ? { youtubeCanalId: yt.id, cuenta: yt.titulo } : {}) },
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    r.log.push(`Error: ${mensaje}`);
    await db.integracion.update({ where: { id: integ.id }, data: { ultimoError: mensaje.slice(0, 2000) } });
  }
  await db.ejecucion.update({
    where: { id: ejecucion.id },
    data: { estado: r.ok ? "ok" : "error", log: r.log.join("\n"), costo: 0 },
  });
  return r;
}

type Deseado = { tipo: "publicacion" | "produccion"; inicio: Date; todoElDia: boolean; evento: Parameters<Google["crearEvento"]>[1] };

export function eventosDeseados(videoId: string, titulo: string, fecha: Date, zona: string, diasAntes: number): Deseado[] {
  const fin = new Date(fecha.getTime() + 30 * 60000);
  const salida: Deseado[] = [
    {
      tipo: "publicacion",
      inicio: fecha,
      todoElDia: false,
      evento: {
        summary: `Publicación: ${titulo}`,
        start: { dateTime: fecha.toISOString(), timeZone: zona },
        end: { dateTime: fin.toISOString(), timeZone: zona },
        extendedProperties: { private: { [MARCA]: videoId, panelTipo: "publicacion" } },
      },
    },
  ];
  if (diasAntes > 0) {
    const dia = sumarDias(fechaLocal(fecha, zona), -diasAntes);
    salida.push({
      tipo: "produccion",
      inicio: new Date(`${dia}T00:00:00Z`),
      todoElDia: true,
      evento: {
        summary: `Producción: ${titulo}`,
        start: { date: dia },
        end: { date: sumarDias(dia, 1) },
        extendedProperties: { private: { [MARCA]: videoId, panelTipo: "produccion" } },
      },
    });
  }
  return salida;
}

function momento(e: EventoGoogle): { inicio: Date; fin: Date | null; todoElDia: boolean } | null {
  if (e.start.dateTime) {
    return { inicio: new Date(e.start.dateTime), fin: e.end?.dateTime ? new Date(e.end.dateTime) : null, todoElDia: false };
  }
  if (e.start.date) return { inicio: new Date(`${e.start.date}T00:00:00Z`), fin: null, todoElDia: true };
  return null;
}

/** Sincroniza todos los canales con Google conectado (lo usa el cron). */
export async function sincronizarTodos(db: Db, deps: Dependencias = {}) {
  const integraciones = await db.integracion.findMany({ where: { proveedor: "google" }, select: { canalId: true, canal: { select: { slug: true } } } });
  const salida: { canal: string; ok: boolean; log: string[] }[] = [];
  for (const i of integraciones) {
    try {
      const r = await sincronizarCanal(db, i.canalId, deps);
      salida.push({ canal: i.canal.slug, ok: r.ok, log: r.log });
      if (!r.ok) log.aviso("sincronizacion_con_errores", { canal: i.canal.slug, detalle: r.log.join(" | ") });
    } catch (e) {
      log.error("sincronizacion_fallida", { canal: i.canal.slug, error: e });
      salida.push({ canal: i.canal.slug, ok: false, log: [`Error: ${e instanceof Error ? e.message : e}`] });
    }
  }
  return salida;
}
