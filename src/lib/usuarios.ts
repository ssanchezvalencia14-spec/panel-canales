// Alta de usuarios y asignación de roles por canal (lo usan los scripts y los tests).

import { z } from "zod";
import type { Db } from "@/lib/db";
import { ROLES, type Rol } from "@/lib/dominio/roles";

export const esquemaAltaUsuario = z.object({
  email: z.string().trim().toLowerCase().email(),
  nombre: z.string().trim().min(1).max(120).optional(),
  superadmin: z.boolean().default(false),
  canal: z.string().optional(),
  rol: z.enum(ROLES).optional(),
});

export type AltaUsuario = z.input<typeof esquemaAltaUsuario>;

export async function crearOActualizarUsuario(db: Db, entrada: AltaUsuario) {
  const d = esquemaAltaUsuario.parse(entrada);
  if (Boolean(d.canal) !== Boolean(d.rol)) {
    throw new Error("Para asignar un rol indica canal y rol juntos.");
  }

  const usuario = await db.user.upsert({
    where: { email: d.email },
    create: { email: d.email, name: d.nombre ?? null, esSuperadmin: d.superadmin },
    update: {
      ...(d.nombre ? { name: d.nombre } : {}),
      ...(d.superadmin ? { esSuperadmin: true } : {}),
    },
  });

  if (d.canal && d.rol) {
    await asignarRol(db, usuario.id, d.canal, d.rol);
  }
  return usuario;
}

export async function asignarRol(db: Db, userId: string, canalSlug: string, rol: Rol) {
  const canal = await db.canal.findUnique({ where: { slug: canalSlug }, select: { id: true } });
  if (!canal) throw new Error(`No existe el canal «${canalSlug}».`);
  return db.membresia.upsert({
    where: { userId_canalId: { userId, canalId: canal.id } },
    create: { userId, canalId: canal.id, rol },
    update: { rol },
  });
}
