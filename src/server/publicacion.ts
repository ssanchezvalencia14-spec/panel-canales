// Fase 4: publicación. Ficha en Drive, programación en YouTube (publishAt),
// TikTok guiado y avisos al equipo. Reglas de oro:
//  - nada se programa ni se publica sin el estado «aprobado» firmado por un
//    revisor o admin;
//  - todo paso que publica exige confirmación explícita (confirmo = true) y
//    queda en el registro de actividad.

import type { Db } from "@/lib/db";
import { puede, rolEnCanal, type Accion } from "@/lib/dominio/roles";
import { NOMBRE_ESTADO, ESTADOS_CON_APROBACION } from "@/lib/dominio/estados";
import { fechaLocal, fechaLocalAUtc, formatearFechaHora } from "@/lib/dominio/fechas";
import { descifrar } from "@/lib/cifrado";
import { limitesDeCanal } from "@/lib/puntaje/titulo";
import { ALCANCE, conexionDeAlcance, configOAuthDesdeEntorno, Google, tieneAlcance, tokenDeAcceso, type ConfigOAuth, type Fetch } from "@/lib/google/cliente";
import {
  borradorFicha,
  configFicha,
  esquemaFicha,
  htmlFicha,
  revisarFicha,
  textosTiktok,
  type Ficha,
  type Fuente,
} from "@/lib/publicacion/ficha";
import { motivosParaNoProgramar } from "@/lib/publicacion/reglas";
import { AccesoDenegado, cambiarEstadoVideo, NoEncontrado, TransicionInvalida, type UsuarioSesion } from "./acceso";
import { avisarEquipo, registrarActividad } from "./actividad";
import { DatoInvalido, registrarPublicacion } from "./metricas";
import { piezasDeCanal, TIPO_CIFRA } from "./produccion";

export type DepsGoogle = { fetch?: Fetch; oauth?: ConfigOAuth | null; ahora?: Date };

function exigir(u: UsuarioSesion, canalId: string, accion: Accion, mensaje?: string) {
  if (!puede(u, canalId, accion)) throw new AccesoDenegado(mensaje);
}

function exigirConfirmacion(confirmo: boolean) {
  if (!confirmo) throw new DatoInvalido("Marca la casilla de confirmación para continuar.");
}

async function videoDelCanal(db: Db, canalId: string, videoId: string) {
  const v = await db.video.findFirst({ where: { id: videoId, canalId }, include: { canal: true } });
  if (!v) throw new NoEncontrado("Video no encontrado en este canal.");
  return v;
}

async function fuentesVerificadas(db: Db, canalId: string, videoId: string): Promise<Fuente[]> {
  const t = await db.tarea.findMany({
    where: { canalId, videoId, tipo: TIPO_CIFRA, estado: "hecha", fuenteUrl: { not: null } },
    orderBy: { creadoEn: "asc" },
    select: { descripcion: true, fuenteUrl: true },
  });
  const vistas = new Set<string>();
  return t.flatMap((x) => (x.fuenteUrl && !vistas.has(x.fuenteUrl) && vistas.add(x.fuenteUrl) ? [{ afirmacion: x.descripcion ?? "", url: x.fuenteUrl }] : []));
}

/** Cliente de Google del canal, comprobando que la conexión tenga el permiso pedido. */
async function googleDeCanal(db: Db, canalId: string, alcance: string, deps: DepsGoogle) {
  // Drive tiene su propia conexión; si una conexión antigua ya traía el permiso, también sirve.
  const tipo = conexionDeAlcance(alcance);
  const conexiones = await db.integracion.findMany({ where: { canalId, proveedor: { in: [tipo, "google"] } } });
  const integ = conexiones.find((c) => c.proveedor === tipo) ?? conexiones.find((c) => tieneAlcance(c.alcances, alcance)) ?? null;
  if (!integ) {
    throw new DatoInvalido(
      tipo === "google_drive"
        ? "El canal no tiene Google Drive conectado (Estadísticas → Integraciones → Conectar Drive)."
        : "El canal no tiene Google conectado (Estadísticas → Integraciones).",
    );
  }
  if (!tieneAlcance(integ.alcances, alcance)) {
    throw new DatoInvalido("La conexión con Google no tiene este permiso. Un admin debe volver a conectar Google en Integraciones.");
  }
  const oauth = deps.oauth === undefined ? configOAuthDesdeEntorno() : deps.oauth;
  if (!oauth) throw new DatoInvalido("Faltan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o AUTH_URL en el servidor.");
  const token = await tokenDeAcceso(oauth, descifrar(integ.refreshTokenCifrado), deps.fetch);
  return { g: new Google(token, deps.fetch), integ };
}

// ─────────────────────────── Ficha ───────────────────────────

export async function fichaPublicacionDeVideo(db: Db, u: UsuarioSesion, canalId: string, videoId: string) {
  exigir(u, canalId, "ver");
  const v = await videoDelCanal(db, canalId, videoId);
  const config = configFicha(v.canal.reglas);
  const fuentes = await fuentesVerificadas(db, canalId, videoId);
  const guardada = esquemaFicha.safeParse(v.fichaPublicacion);
  const ficha: Ficha = guardada.success ? guardada.data : borradorFicha(v, config, fuentes);
  const revision = revisarFicha(ficha, config, limitesDeCanal(v.canal.reglas).maximo, fuentes);
  return { ficha, guardada: guardada.success, config, fuentes, revision, partesTiktok: piezasDeCanal(v.canal.reglas).tiktok };
}

export async function guardarFicha(db: Db, u: UsuarioSesion, canalId: string, videoId: string, entrada: unknown) {
  exigir(u, canalId, "editar_video", "Tu rol no permite editar la ficha.");
  const v = await videoDelCanal(db, canalId, videoId);
  const r = esquemaFicha.safeParse(entrada);
  if (!r.success) throw new DatoInvalido(r.error.issues.map((i) => i.message).join(" · "));
  const config = configFicha(v.canal.reglas);
  const revision = revisarFicha(r.data, config, limitesDeCanal(v.canal.reglas).maximo, await fuentesVerificadas(db, canalId, videoId));
  if (revision.errores.length) throw new DatoInvalido(revision.errores.join(" "));
  await db.video.update({ where: { id: v.id }, data: { fichaPublicacion: r.data } });
  await registrarActividad(db, { canalId, videoId, userId: u.id, accion: "ficha_guardada", resumen: "Ficha de publicación guardada" });
  return revision;
}

/** Crea (o actualiza) la carpeta del video en Drive y su ficha como Google Doc. */
export async function generarFichaEnDrive(db: Db, u: UsuarioSesion, canalId: string, videoId: string, deps: DepsGoogle = {}) {
  exigir(u, canalId, "editar_video", "Tu rol no permite crear la ficha en Drive.");
  const v = await videoDelCanal(db, canalId, videoId);
  const { ficha, guardada, config, revision, partesTiktok } = await fichaPublicacionDeVideo(db, u, canalId, videoId);
  if (!guardada) throw new DatoInvalido("Revisa y guarda la ficha antes de generarla en Drive.");
  if (revision.errores.length) throw new DatoInvalido(revision.errores.join(" "));

  const { g, integ } = await googleDeCanal(db, canalId, ALCANCE.drive, deps);
  let raiz = integ.driveCarpetaId;
  if (!raiz) {
    raiz = (await g.crearCarpeta(`${v.canal.nombre} · Panel`)).id;
    await db.integracion.update({ where: { id: integ.id }, data: { driveCarpetaId: raiz } });
  }
  let carpeta = v.driveCarpetaId ? { id: v.driveCarpetaId, webViewLink: v.driveCarpetaUrl ?? "" } : null;
  if (!carpeta) {
    const fecha = v.fechaPublicacion ? fechaLocal(v.fechaPublicacion, v.canal.zonaHoraria) : "sin-fecha";
    carpeta = await g.crearCarpeta(`${fecha} · ${v.titulo}`.slice(0, 200), raiz);
  }

  const [archivos, pubYoutube] = await Promise.all([
    db.activo.findMany({ where: { canalId, videoId }, orderBy: [{ tipo: "asc" }, { version: "desc" }], select: { tipo: true, url: true } }),
    db.publicacion.findFirst({ where: { canalId, videoId, plataforma: "youtube" }, select: { url: true } }),
  ]);
  const html = htmlFicha({
    canal: v.canal.nombre,
    video: v.titulo,
    publicacion: v.fechaPublicacion ? formatearFechaHora(v.fechaPublicacion, v.canal.zonaHoraria, v.canal.idioma) : null,
    ficha,
    config,
    partesTiktok,
    enlaceYoutube: pubYoutube?.url ?? null,
    archivos,
  });
  const doc = v.fichaDriveId
    ? await g.actualizarDocumento(v.fichaDriveId, html)
    : await g.crearDocumento(`Ficha · ${v.titulo}`.slice(0, 200), html, carpeta.id);

  const actualizado = await db.video.update({
    where: { id: v.id },
    data: { driveCarpetaId: carpeta.id, driveCarpetaUrl: carpeta.webViewLink, fichaDriveId: doc.id, fichaDriveUrl: doc.webViewLink },
  });
  await registrarActividad(db, {
    canalId,
    videoId,
    userId: u.id,
    accion: "drive_ficha",
    resumen: v.fichaDriveId ? "Ficha actualizada en Drive" : "Carpeta y ficha creadas en Drive",
    detalle: { carpeta: carpeta.webViewLink, ficha: doc.webViewLink },
  });
  return { carpetaUrl: actualizado.driveCarpetaUrl, fichaUrl: actualizado.fichaDriveUrl };
}

// ─────────────────────────── YouTube ───────────────────────────

/** Momento de publicación: la fecha del video o una fecha local dada, a la hora del canal. */
function momentoDePublicacion(v: Awaited<ReturnType<typeof videoDelCanal>>, fechaLocalElegida: string | null): Date | null {
  if (fechaLocalElegida) return fechaLocalAUtc(fechaLocalElegida, v.canal.horaPublicacion, v.canal.zonaHoraria);
  return v.fechaPublicacion;
}

export async function estadoParaProgramar(db: Db, u: UsuarioSesion, canalId: string, videoId: string, fechaLocalElegida: string | null = null, ahora = new Date()) {
  exigir(u, canalId, "ver");
  const v = await videoDelCanal(db, canalId, videoId);
  const [pub, aprobador] = await Promise.all([
    db.publicacion.findFirst({ where: { canalId, videoId, plataforma: "youtube", externoId: { not: null } }, select: { id: true, externoId: true, url: true } }),
    v.aprobadoPorId ? db.user.findUnique({ where: { id: v.aprobadoPorId }, select: { esSuperadmin: true, membresias: { select: { canalId: true, rol: true } }, email: true } }) : null,
  ]);
  const publishAt = momentoDePublicacion(v, fechaLocalElegida);
  const motivos = motivosParaNoProgramar({
    estado: v.estado,
    aprobadoEn: v.aprobadoEn,
    rolAprobador: aprobador ? rolEnCanal(aprobador, canalId) : null,
    fichaEnDrive: Boolean(v.fichaDriveId),
    idYoutube: pub?.externoId ?? null,
    publishAt,
    ahora,
  });
  return { v, pub, publishAt, motivos, aprobador: aprobador?.email ?? null };
}

export async function programarEnYoutube(
  db: Db,
  u: UsuarioSesion,
  canalId: string,
  videoId: string,
  opciones: { confirmo: boolean; fechaLocal: string | null },
  deps: DepsGoogle = {},
) {
  exigir(u, canalId, "publicar", "Solo un admin del canal puede programar en YouTube.");
  exigirConfirmacion(opciones.confirmo);
  const { v, pub, publishAt, motivos } = await estadoParaProgramar(db, u, canalId, videoId, opciones.fechaLocal, deps.ahora);
  if (motivos.length) throw new DatoInvalido(motivos.join(" "));
  const { ficha, config } = await fichaPublicacionDeVideo(db, u, canalId, videoId);

  const { g, integ } = await googleDeCanal(db, canalId, ALCANCE.youtube, deps);
  const actual = await g.video(pub!.externoId!);
  if (!actual) throw new DatoInvalido("YouTube no encuentra ese video con la cuenta conectada. ¿Lo subió el mismo canal?");
  if (integ.youtubeCanalId && actual.snippet.channelId !== integ.youtubeCanalId) {
    throw new DatoInvalido("Ese video pertenece a otro canal de YouTube distinto al conectado.");
  }
  if (actual.status.privacyStatus !== "private") {
    throw new DatoInvalido(`El video ya es «${actual.status.privacyStatus}» en YouTube: solo se puede programar un video privado que nunca se publicó.`);
  }

  // videos.update borra lo que no se envía: se parte del video actual.
  const respuesta = await g.actualizarVideo({
    id: actual.id,
    snippet: {
      ...actual.snippet,
      title: ficha.youtube.titulo,
      description: ficha.youtube.descripcion,
      tags: ficha.youtube.etiquetas,
    },
    status: {
      privacyStatus: "private",
      publishAt: publishAt!.toISOString(),
      ...(actual.status.license ? { license: actual.status.license } : {}),
      ...(actual.status.embeddable !== undefined ? { embeddable: actual.status.embeddable } : {}),
      ...(actual.status.publicStatsViewable !== undefined ? { publicStatsViewable: actual.status.publicStatsViewable } : {}),
      ...(config.contenidoSintetico ? { containsSyntheticMedia: true } : {}),
    },
  });

  await cambiarEstadoVideo(db, u, videoId, "programado");
  await db.video.update({ where: { id: v.id }, data: { youtubeProgramadoPara: publishAt } });
  await db.publicacion.update({ where: { id: pub!.id }, data: { programada: publishAt } });

  const cuando = formatearFechaHora(publishAt!, v.canal.zonaHoraria, v.canal.idioma);
  await registrarActividad(db, {
    canalId,
    videoId,
    userId: u.id,
    accion: "youtube_programado",
    resumen: `Programado en YouTube para ${cuando} (${v.canal.zonaHoraria})`,
    detalle: { youtubeId: actual.id, publishAt: respuesta.status.publishAt ?? publishAt!.toISOString(), url: pub!.url },
  });
  await avisarEquipo(db, {
    canalId,
    videoId,
    userId: u.id,
    asunto: `Programado: ${v.titulo}`,
    texto: `${u.email} programó «${v.titulo}» en YouTube para ${cuando} (${v.canal.zonaHoraria}).\n${pub!.url ?? ""}\n\nFicha: ${v.fichaDriveUrl ?? "—"}`,
  });
  return { publishAt: publishAt!, cuando };
}

// ─────────────────────────── TikTok (manual guiado) ───────────────────────────

export async function registrarTiktokPublicado(
  db: Db,
  u: UsuarioSesion,
  canalId: string,
  videoId: string,
  datos: { parte: number; enlace: string; confirmo: boolean },
) {
  exigir(u, canalId, "editar_video", "Tu rol no permite registrar publicaciones.");
  exigirConfirmacion(datos.confirmo);
  const v = await videoDelCanal(db, canalId, videoId);
  if (!ESTADOS_CON_APROBACION.includes(v.estado) || !v.aprobadoEn) {
    throw new DatoInvalido(`Solo se publica un video aprobado (está en «${NOMBRE_ESTADO[v.estado]}»).`);
  }
  const partes = Math.max(piezasDeCanal(v.canal.reglas).tiktok, 1);
  if (!Number.isInteger(datos.parte) || datos.parte < 1 || datos.parte > partes) throw new DatoInvalido(`La parte debe ir de 1 a ${partes}.`);
  const pub = await registrarPublicacion(db, u, canalId, { videoId, enlace: datos.enlace, plataforma: "tiktok", publicada: new Date() });
  if (pub.plataforma !== "tiktok") throw new DatoInvalido("Ese enlace no es de TikTok.");

  await registrarActividad(db, {
    canalId,
    videoId,
    userId: u.id,
    accion: "tiktok_publicado",
    resumen: `TikTok parte ${datos.parte}/${partes} publicado`,
    detalle: { parte: datos.parte, url: pub.url },
  });
  await avisarEquipo(db, {
    canalId,
    videoId,
    userId: u.id,
    asunto: `TikTok publicado: ${v.titulo} (parte ${datos.parte}/${partes})`,
    texto: `${u.email} publicó en TikTok la parte ${datos.parte}/${partes} de «${v.titulo}».\n${pub.url}`,
  });
  return pub;
}

/** Textos listos para copiar de cada parte de TikTok. */
export async function guiaTiktok(db: Db, u: UsuarioSesion, canalId: string, videoId: string) {
  const { ficha, config, partesTiktok } = await fichaPublicacionDeVideo(db, u, canalId, videoId);
  const publicadas = await db.publicacion.findMany({ where: { canalId, videoId, plataforma: "tiktok" }, select: { url: true, publicada: true } });
  return { partes: textosTiktok(ficha, partesTiktok), checklist: config.checklistTiktok, publicadas };
}

// ─────────────────────────── Publicado ───────────────────────────

export async function marcarPublicado(db: Db, u: UsuarioSesion, canalId: string, videoId: string, datos: { confirmo: boolean }, ahora = new Date()) {
  exigir(u, canalId, "publicar", "Solo un admin del canal puede marcar un video como publicado.");
  exigirConfirmacion(datos.confirmo);
  const v = await videoDelCanal(db, canalId, videoId);
  if (v.estado !== "programado") throw new TransicionInvalida("Solo se marca como publicado un video programado.");
  if (v.youtubeProgramadoPara && v.youtubeProgramadoPara > ahora) {
    throw new DatoInvalido("Todavía no llega la hora programada en YouTube.");
  }
  await cambiarEstadoVideo(db, u, videoId, "publicado");
  await db.publicacion.updateMany({
    where: { canalId, videoId, plataforma: "youtube", publicada: null },
    data: { publicada: v.youtubeProgramadoPara ?? ahora },
  });
  await registrarActividad(db, { canalId, videoId, userId: u.id, accion: "video_publicado", resumen: "Video marcado como publicado" });
  await avisarEquipo(db, {
    canalId,
    videoId,
    userId: u.id,
    asunto: `Publicado: ${v.titulo}`,
    texto: `«${v.titulo}» ya está publicado en YouTube. Marcado por ${u.email}.`,
  });
}

