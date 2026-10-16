// Registro de actividad del canal. Se escribe desde el servidor en cada paso
// relevante (cambios de estado, Drive, YouTube, TikTok, avisos al equipo).

import type { Db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { enviarCorreo } from "@/lib/correo";
import { nombrePanel } from "@/lib/panel";

export type Accion =
  | "estado_cambiado"
  | "ficha_guardada"
  | "drive_ficha"
  | "youtube_programado"
  | "tiktok_publicado"
  | "video_publicado"
  | "aviso_equipo";

export async function registrarActividad(
  db: Db,
  a: { canalId: string; videoId?: string | null; userId?: string | null; accion: Accion; resumen: string; detalle?: unknown },
) {
  return db.actividad.create({
    data: {
      canalId: a.canalId,
      videoId: a.videoId ?? null,
      userId: a.userId ?? null,
      accion: a.accion,
      resumen: a.resumen.slice(0, 500),
      detalle: a.detalle === undefined ? Prisma.DbNull : (JSON.parse(JSON.stringify(a.detalle)) as Prisma.InputJsonValue),
    },
  });
}

/**
 * Aviso por correo a todo el equipo activo del canal. Nunca lanza: si el
 * correo falla, queda anotado en la actividad y el paso que publicó no se revierte.
 */
export async function avisarEquipo(
  db: Db,
  datos: { canalId: string; videoId?: string | null; userId?: string | null; asunto: string; texto: string },
) {
  const miembros = await db.membresia.findMany({
    where: { canalId: datos.canalId, user: { activo: true } },
    select: { user: { select: { email: true } } },
  });
  const para = [...new Set(miembros.map((m) => m.user.email))];
  let resumen: string;
  try {
    const r = await enviarCorreo({ para, asunto: `[${nombrePanel()}] ${datos.asunto}`, texto: datos.texto });
    resumen = `Aviso enviado a ${r.enviados} persona(s): ${datos.asunto}`;
  } catch (e) {
    resumen = `No se pudo enviar el aviso «${datos.asunto}»: ${e instanceof Error ? e.message : e}`;
  }
  await registrarActividad(db, { canalId: datos.canalId, videoId: datos.videoId, userId: datos.userId, accion: "aviso_equipo", resumen, detalle: { para } });
  return resumen;
}

export async function listarActividad(db: Db, canalId: string, videoId?: string, cantidad = 100) {
  return db.actividad.findMany({
    where: { canalId, ...(videoId ? { videoId } : {}) },
    orderBy: { creadoEn: "desc" },
    take: cantidad,
    select: {
      id: true,
      accion: true,
      resumen: true,
      creadoEn: true,
      user: { select: { email: true } },
      video: { select: { id: true, titulo: true } },
    },
  });
}
