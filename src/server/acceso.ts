// Capa de acceso a datos. Toda lectura o escritura de contenido pasa por aquí
// y se filtra por los canales del usuario. Las páginas nunca consultan Prisma
// directamente.

import type { Db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { ConfigCanal } from "@/lib/dominio/canal-config";
import { ganchoAprobado, objetivoGancho } from "@/lib/puntaje/gancho";
import { insertarCanal } from "@/lib/canales";
import {
  canalesVisibles,
  puede,
  puedeAdministrarRed,
  rolEnCanal,
  type Rol,
  type UsuarioConMembresias,
} from "@/lib/dominio/roles";
import {
  ESTADOS_VIDEO,
  efectoAprobacion,
  validarTransicion,
  type EstadoVideo,
} from "@/lib/dominio/estados";

export type UsuarioSesion = UsuarioConMembresias & {
  id: string;
  email: string;
  nombre: string | null;
  membresias: { canalId: string; rol: Rol }[];
};

export class AccesoDenegado extends Error {
  constructor(mensaje = "No tienes permiso para esta acción.") {
    super(mensaje);
    this.name = "AccesoDenegado";
  }
}

export class NoEncontrado extends Error {
  constructor(mensaje = "No encontrado.") {
    super(mensaje);
    this.name = "NoEncontrado";
  }
}

export class TransicionInvalida extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "TransicionInvalida";
  }
}

/** Carga al usuario activo con sus membresías. Null si no existe o está inactivo. */
export async function cargarUsuario(db: Db, userId: string): Promise<UsuarioSesion | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      esSuperadmin: true,
      activo: true,
      membresias: { select: { canalId: true, rol: true } },
    },
  });
  if (!u || !u.activo) return null;
  return {
    id: u.id,
    email: u.email,
    nombre: u.name,
    esSuperadmin: u.esSuperadmin,
    membresias: u.membresias,
  };
}

/** Filtro `canalId` para cualquier tabla de contenido. */
export function filtroCanal(usuario: UsuarioConMembresias): { canalId?: { in: string[] } } {
  const visibles = canalesVisibles(usuario);
  return visibles === "todos" ? {} : { canalId: { in: visibles } };
}

function filtroIdCanal(usuario: UsuarioConMembresias): Prisma.CanalWhereInput {
  const visibles = canalesVisibles(usuario);
  return visibles === "todos" ? {} : { id: { in: visibles } };
}

export async function listarCanales(db: Db, usuario: UsuarioSesion) {
  return db.canal.findMany({
    where: { activo: true, ...filtroIdCanal(usuario) },
    orderBy: { nombre: "asc" },
  });
}

/** Devuelve el canal solo si el usuario puede verlo (si no, null: no se revela que existe). */
export async function obtenerCanalPorSlug(db: Db, usuario: UsuarioSesion, slug: string) {
  const canal = await db.canal.findFirst({
    where: { slug, activo: true, ...filtroIdCanal(usuario) },
  });
  if (!canal || !puede(usuario, canal.id, "ver")) return null;
  return canal;
}

export async function listarVideosDeCanal(db: Db, usuario: UsuarioSesion, canalId: string) {
  if (!puede(usuario, canalId, "ver")) throw new AccesoDenegado();
  return db.video.findMany({
    where: { canalId, ...filtroCanal(usuario) },
    orderBy: [{ fechaPublicacion: "asc" }, { creadoEn: "asc" }],
    select: {
      id: true,
      titulo: true,
      pilar: true,
      estado: true,
      fechaPublicacion: true,
      fuentesOk: true,
      aprobadoEn: true,
      aprobadoPor: { select: { name: true, email: true } },
    },
  });
}

export type ResumenCanal = {
  canal: { id: string; slug: string; nombre: string; colorAcento: string; zonaHoraria: string; idioma: string };
  total: number;
  porEstado: Record<EstadoVideo, number>;
  proxima: { titulo: string; fechaPublicacion: Date } | null;
};

/** Vista «Red»: un resumen por cada canal visible. */
export async function resumenRed(db: Db, usuario: UsuarioSesion, ahora = new Date()): Promise<ResumenCanal[]> {
  const canales = await listarCanales(db, usuario);
  if (canales.length === 0) return [];
  const ids = canales.map((c) => c.id);

  const [conteos, proximas] = await Promise.all([
    db.video.groupBy({
      by: ["canalId", "estado"],
      where: { canalId: { in: ids }, ...filtroCanal(usuario) },
      _count: { _all: true },
    }),
    db.video.findMany({
      where: {
        canalId: { in: ids },
        ...filtroCanal(usuario),
        fechaPublicacion: { gte: ahora },
        estado: { not: "publicado" },
      },
      orderBy: { fechaPublicacion: "asc" },
      select: { canalId: true, titulo: true, fechaPublicacion: true },
    }),
  ]);

  return canales.map((c) => {
    const porEstado = Object.fromEntries(ESTADOS_VIDEO.map((e) => [e, 0])) as Record<EstadoVideo, number>;
    for (const fila of conteos) {
      if (fila.canalId === c.id) porEstado[fila.estado] = fila._count._all;
    }
    const prox = proximas.find((p) => p.canalId === c.id);
    return {
      canal: {
        id: c.id,
        slug: c.slug,
        nombre: c.nombre,
        colorAcento: c.colorAcento,
        zonaHoraria: c.zonaHoraria,
        idioma: c.idioma,
      },
      total: Object.values(porEstado).reduce((a, b) => a + b, 0),
      porEstado,
      proxima: prox?.fechaPublicacion ? { titulo: prox.titulo, fechaPublicacion: prox.fechaPublicacion } : null,
    };
  });
}

/**
 * Cambia el estado de un video aplicando permisos y reglas del flujo.
 * La actualización es condicional al estado leído, así dos personas moviendo
 * el mismo video a la vez no se pisan.
 */
export async function cambiarEstadoVideo(
  db: Db,
  usuario: UsuarioSesion,
  videoId: string,
  hasta: EstadoVideo,
) {
  const video = await db.video.findFirst({
    where: { id: videoId, ...filtroCanal(usuario) },
    select: {
      id: true,
      canalId: true,
      estado: true,
      fuentesOk: true,
      aprobadoPorId: true,
      aprobadoEn: true,
      scoreGancho: true,
      ganchoForzadoEn: true,
      canal: { select: { reglas: true } },
    },
  });
  if (!video) throw new NoEncontrado("Video no encontrado.");

  const resultado = validarTransicion({
    desde: video.estado,
    hasta,
    rol: rolEnCanal(usuario, video.canalId),
    fuentesOk: video.fuentesOk,
    aprobado: Boolean(video.aprobadoPorId && video.aprobadoEn),
    ganchoOk: ganchoAprobado(video, objetivoGancho(video.canal.reglas)),
  });
  if (!resultado.ok) throw new TransicionInvalida(resultado.motivo);

  const efecto = efectoAprobacion(video.estado, hasta);
  const datos: Prisma.VideoUncheckedUpdateManyInput = { estado: hasta };
  if (efecto === "firmar") {
    datos.aprobadoPorId = usuario.id;
    datos.aprobadoEn = new Date();
  } else if (efecto === "retirar") {
    datos.aprobadoPorId = null;
    datos.aprobadoEn = null;
  }

  const { count } = await db.video.updateMany({
    where: { id: video.id, canalId: video.canalId, estado: video.estado },
    data: datos,
  });
  if (count === 0) {
    throw new TransicionInvalida("El video cambió mientras tanto. Recarga e inténtalo de nuevo.");
  }
  return db.video.findUniqueOrThrow({ where: { id: video.id } });
}

// ─────────────────────────── Canales de la red ───────────────────────────

/** Crea un canal nuevo desde la UI. Solo el superadmin de red. */
export async function crearCanal(db: Db, usuario: UsuarioSesion, config: ConfigCanal) {
  if (!puedeAdministrarRed(usuario)) {
    throw new AccesoDenegado("Solo un superadmin de red puede crear canales.");
  }
  return insertarCanal(db, config);
}

// ─────────────────────────── Equipo del canal ───────────────────────────

export async function listarMiembros(db: Db, usuario: UsuarioSesion, canalId: string) {
  if (!puede(usuario, canalId, "ver")) throw new AccesoDenegado();
  return db.membresia.findMany({
    where: { canalId },
    orderBy: [{ rol: "asc" }, { creadoEn: "asc" }],
    select: {
      rol: true,
      creadoEn: true,
      user: { select: { id: true, email: true, name: true, activo: true, esSuperadmin: true } },
    },
  });
}

function exigirGestion(usuario: UsuarioSesion, canalId: string) {
  if (!puede(usuario, canalId, "gestionar_miembros")) {
    throw new AccesoDenegado("Solo un admin del canal puede gestionar el equipo.");
  }
}

/** Da acceso a un correo (lo crea si no existe) con un rol en el canal. */
export async function agregarMiembro(
  db: Db,
  usuario: UsuarioSesion,
  canalId: string,
  datos: { email: string; nombre?: string; rol: Rol },
) {
  exigirGestion(usuario, canalId);
  const email = datos.email.trim().toLowerCase();
  const miembro = await db.user.upsert({
    where: { email },
    create: { email, name: datos.nombre?.trim() || null },
    update: {},
  });
  return db.membresia.upsert({
    where: { userId_canalId: { userId: miembro.id, canalId } },
    create: { userId: miembro.id, canalId, rol: datos.rol },
    update: { rol: datos.rol },
  });
}

export async function cambiarRolMiembro(
  db: Db,
  usuario: UsuarioSesion,
  canalId: string,
  userId: string,
  rol: Rol,
) {
  exigirGestion(usuario, canalId);
  if (userId === usuario.id && !usuario.esSuperadmin) {
    throw new AccesoDenegado("No puedes cambiar tu propio rol.");
  }
  const { count } = await db.membresia.updateMany({ where: { canalId, userId }, data: { rol } });
  if (count === 0) throw new NoEncontrado("Esa persona no es miembro del canal.");
}

export async function quitarMiembro(db: Db, usuario: UsuarioSesion, canalId: string, userId: string) {
  exigirGestion(usuario, canalId);
  if (userId === usuario.id && !usuario.esSuperadmin) {
    throw new AccesoDenegado("No puedes quitarte a ti mismo del canal.");
  }
  const { count } = await db.membresia.deleteMany({ where: { canalId, userId } });
  if (count === 0) throw new NoEncontrado("Esa persona no es miembro del canal.");
}

// ─────────────────────────── Sesión (proxy) ───────────────────────────

/**
 * Usuario de una cookie de sesión de Auth.js, con los slugs de sus canales.
 * Null si la sesión no existe, venció o el usuario está desactivado.
 */
export async function usuarioDeSesion(db: Db, sessionToken: string, ahora = new Date()) {
  const sesion = await db.session.findUnique({
    where: { sessionToken },
    select: {
      expires: true,
      user: {
        select: {
          activo: true,
          esSuperadmin: true,
          membresias: { select: { canal: { select: { slug: true } } } },
        },
      },
    },
  });
  if (!sesion || sesion.expires <= ahora || !sesion.user.activo) return null;
  return {
    esSuperadmin: sesion.user.esSuperadmin,
    slugs: sesion.user.membresias.map((m) => m.canal.slug),
  };
}
