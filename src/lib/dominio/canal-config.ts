// Validación de la configuración de un canal. Todo lo específico de un canal
// (marca, horario, pilares, reglas) entra por aquí como datos.

import { z } from "zod";
import { esHoraValida, esZonaHorariaValida } from "./fechas";

export const DIAS_SEMANA = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"] as const;

export const esquemaCanal = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug en minúsculas con guiones"),
  nombre: z.string().trim().min(1).max(120),
  idioma: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).default("es"),
  zonaHoraria: z.string().refine(esZonaHorariaValida, "zona horaria IANA inválida"),
  horaPublicacion: z.string().refine(esHoraValida, "hora en formato HH:mm"),
  diasPublicacion: z.array(z.enum(DIAS_SEMANA)).min(1),
  colorAcento: z.string().regex(/^#[0-9a-fA-F]{6}$/, "color en formato #RRGGBB"),
  pilares: z.array(z.string().trim().min(1)).min(1),
  reglas: z.record(z.string(), z.unknown()).default({}),
  limiteGastoVideo: z.number().nonnegative().nullable().default(null),
});

export type ConfigCanal = z.infer<typeof esquemaCanal>;

/** Color de acento seguro para CSS (solo #RRGGBB); si no, el de respaldo. */
export function colorSeguro(color: string | null | undefined, respaldo: string): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : respaldo;
}

/** Lee la lista de pilares guardada como JSON en la base. */
export function leerPilares(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((x): x is string => typeof x === "string") : [];
}

/** Lee los días de publicación guardados como JSON en la base. */
export function leerDias(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((x): x is string => typeof x === "string") : [];
}
