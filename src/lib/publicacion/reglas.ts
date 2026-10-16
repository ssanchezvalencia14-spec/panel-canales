// Reglas para programar en YouTube. Puras: las usa el servidor antes de llamar
// a la API y la interfaz para explicar qué falta.

import { rolPuede, type RolEfectivo } from "@/lib/dominio/roles";
import { NOMBRE_ESTADO, type EstadoVideo } from "@/lib/dominio/estados";

export type CondicionesProgramar = {
  estado: string;
  aprobadoEn: Date | null;
  /** Rol en el canal de quien firmó la aprobación (o «superadmin»). */
  rolAprobador: RolEfectivo | null;
  fichaEnDrive: boolean;
  idYoutube: string | null;
  publishAt: Date | null;
  ahora: Date;
};

/** Lista de motivos por los que NO se puede programar; vacía = se puede. */
export function motivosParaNoProgramar(c: CondicionesProgramar): string[] {
  const m: string[] = [];
  if (c.estado !== "aprobado") m.push(`El video debe estar en «Aprobado» (está en «${NOMBRE_ESTADO[c.estado as EstadoVideo] ?? c.estado}»).`);
  if (!c.aprobadoEn || !rolPuede(c.rolAprobador, "aprobar")) {
    m.push("Falta la firma de aprobación de un revisor o admin del canal.");
  }
  if (!c.fichaEnDrive) m.push("Primero genera la carpeta y la ficha en Drive.");
  if (!c.idYoutube) m.push("Registra el enlace del video subido a YouTube como privado (sección Publicaciones).");
  if (!c.publishAt) m.push("El video no tiene fecha de publicación.");
  else if (c.publishAt.getTime() < c.ahora.getTime() + 15 * 60_000) {
    m.push("La fecha de publicación debe ser al menos 15 minutos en el futuro.");
  }
  return m;
}
