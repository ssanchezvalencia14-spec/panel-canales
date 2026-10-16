import { timingSafeEqual } from "node:crypto";

/** Las rutas de cron exigen «Authorization: Bearer <CRON_SECRET>» (mín. 16 caracteres). */
export function cronAutorizado(cabecera: string | null, secreto = process.env.CRON_SECRET): boolean {
  if (!secreto || secreto.length < 16) return false;
  const recibido = Buffer.from(cabecera?.replace(/^Bearer\s+/i, "") ?? "");
  const esperado = Buffer.from(secreto);
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}
