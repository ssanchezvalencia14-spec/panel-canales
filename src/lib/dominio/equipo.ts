// Acceso del equipo a un canal nuevo. Cada persona ve solo los canales donde
// tiene un rol, así que un canal recién agregado no lo vería nadie salvo el
// superadmin. Al crearlo se le da acceso al equipo actual de la red.

import type { Rol } from "./roles";

/** De menos a más permisos: ante un empate se elige el de menos permisos. */
const ORDEN: readonly Rol[] = ["lector", "revisor", "productor", "admin"];

/** El rol que la persona tiene en más canales; si hay empate, el de menos permisos. */
export function rolParaCanalNuevo(roles: readonly Rol[]): Rol | null {
  if (roles.length === 0) return null;
  const cuenta = new Map<Rol, number>();
  for (const r of roles) cuenta.set(r, (cuenta.get(r) ?? 0) + 1);
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || ORDEN.indexOf(a[0]) - ORDEN.indexOf(b[0]))[0][0];
}
