// Permisos por rol, aplicados en el servidor.
// Un usuario tiene un rol por canal (tabla membresias). El superadmin de red
// tiene todos los permisos en todos los canales.

export const ROLES = ["admin", "productor", "revisor", "lector"] as const;
export type Rol = (typeof ROLES)[number];

/** Rol efectivo de un usuario en un canal. */
export type RolEfectivo = Rol | "superadmin";

export const ACCIONES = [
  "ver",
  "crear_video",
  "editar_video",
  "mover_estado",
  "aprobar",
  "publicar",
  "gestionar_miembros",
  "configurar_canal",
] as const;
export type Accion = (typeof ACCIONES)[number];

const PERMISOS: Record<Rol, readonly Accion[]> = {
  admin: ACCIONES,
  productor: ["ver", "crear_video", "editar_video", "mover_estado"],
  revisor: ["ver", "mover_estado", "aprobar"],
  lector: ["ver"],
};

export const NOMBRE_ROL: Record<RolEfectivo, string> = {
  superadmin: "Superadmin de red",
  admin: "Admin",
  productor: "Productor",
  revisor: "Revisor",
  lector: "Lector",
};

export type UsuarioConMembresias = {
  esSuperadmin: boolean;
  membresias: ReadonlyArray<{ canalId: string; rol: Rol }>;
};

export function rolEnCanal(
  usuario: UsuarioConMembresias,
  canalId: string,
): RolEfectivo | null {
  if (usuario.esSuperadmin) return "superadmin";
  return usuario.membresias.find((m) => m.canalId === canalId)?.rol ?? null;
}

export function rolPuede(rol: RolEfectivo | null, accion: Accion): boolean {
  if (rol === null) return false;
  if (rol === "superadmin") return true;
  return PERMISOS[rol].includes(accion);
}

export function puede(
  usuario: UsuarioConMembresias,
  canalId: string,
  accion: Accion,
): boolean {
  return rolPuede(rolEnCanal(usuario, canalId), accion);
}

/** Acciones de red (no ligadas a un canal): solo el superadmin. */
export function puedeAdministrarRed(usuario: UsuarioConMembresias): boolean {
  return usuario.esSuperadmin;
}

/**
 * Canales que el usuario puede ver. `"todos"` para el superadmin; si no, la
 * lista de ids de sus membresías. Toda consulta de contenido se filtra con esto.
 */
export function canalesVisibles(usuario: UsuarioConMembresias): "todos" | string[] {
  if (usuario.esSuperadmin) return "todos";
  return usuario.membresias.map((m) => m.canalId);
}
