// Fase 6: vista de auditoría de la red (solo superadmin). Quién tiene acceso a
// qué, integraciones conectadas, fallos recientes, gasto del mes y estado de
// la configuración del servidor (solo si cada variable existe, nunca su valor).

import type { Db } from "@/lib/db";
import { puedeAdministrarRed } from "@/lib/dominio/roles";
import { AccesoDenegado, type UsuarioSesion } from "./acceso";
import { gastoDelMes } from "./produccion";

/** Variables que el panel necesita en producción: se informa solo si están definidas. */
export const VARIABLES_REVISADAS = [
  ["DATABASE_URL", "Base de datos"],
  ["AUTH_SECRET", "Firma de sesiones"],
  ["AUTH_URL", "URL pública del panel"],
  ["SMTP_HOST", "Correo (enlaces de acceso y avisos)"],
  ["EMAIL_FROM", "Remitente de los correos"],
  ["CRON_SECRET", "Tareas programadas"],
  ["INTEGRACIONES_CLAVE", "Cifrado de tokens de Google"],
  ["GOOGLE_CLIENT_ID", "Conexión con Google"],
  ["ANTHROPIC_API_KEY", "IA por API (opcional: sin ella se usa el modo chat)"],
  ["RESPALDOS_DIR", "Carpeta de respaldos (opcional)"],
] as const;

export function estadoConfiguracion(env: Record<string, string | undefined> = process.env) {
  return VARIABLES_REVISADAS.map(([nombre, uso]) => ({ nombre, uso, definida: Boolean(env[nombre]?.trim()) }));
}

export async function auditoriaRed(db: Db, u: UsuarioSesion, ahora = new Date()) {
  if (!puedeAdministrarRed(u)) throw new AccesoDenegado("Solo un superadmin de red ve la auditoría.");
  const hace30 = new Date(ahora.getTime() - 30 * 864e5);

  const [usuarios, canales, integraciones, fallos, actividad] = await Promise.all([
    db.user.findMany({
      orderBy: [{ esSuperadmin: "desc" }, { email: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        activo: true,
        esSuperadmin: true,
        membresias: { select: { rol: true, canal: { select: { slug: true, nombre: true } } } },
        sessions: { where: { expires: { gt: ahora } }, select: { expires: true } },
      },
    }),
    db.canal.findMany({ orderBy: { nombre: "asc" }, select: { id: true, slug: true, nombre: true, activo: true } }),
    db.integracion.findMany({
      select: {
        proveedor: true,
        cuenta: true,
        alcances: true,
        ultimaSincronizacion: true,
        ultimoError: true,
        actualizadoEn: true,
        canal: { select: { slug: true, nombre: true } },
        conectadoPor: { select: { email: true } },
      },
    }),
    db.ejecucion.findMany({
      where: { estado: "error", creadoEn: { gte: hace30 } },
      orderBy: { creadoEn: "desc" },
      take: 30,
      select: { id: true, tipo: true, log: true, creadoEn: true, canal: { select: { slug: true } }, video: { select: { id: true, titulo: true } } },
    }),
    db.actividad.findMany({
      orderBy: { creadoEn: "desc" },
      take: 50,
      select: { id: true, accion: true, resumen: true, creadoEn: true, canal: { select: { slug: true } }, user: { select: { email: true } } },
    }),
  ]);

  const gasto = await Promise.all(canales.filter((c) => c.activo).map(async (c) => ({ canal: c, ...(await gastoDelMes(db, c.id, ahora)) })));

  return {
    usuarios: usuarios.map((x) => ({
      ...x,
      sesionesActivas: x.sessions.length,
      sinCanal: !x.esSuperadmin && x.membresias.length === 0,
    })),
    canales,
    integraciones,
    fallos,
    actividad,
    gasto,
    configuracion: estadoConfiguracion(),
  };
}
