// «state» firmado del flujo OAuth: ata la vuelta de Google al canal, al usuario
// que inició la conexión y a una ventana de 10 minutos.

import { createHmac, timingSafeEqual } from "node:crypto";

export type EstadoOAuth = { canalId: string; userId: string; vence: number };

function secreto(valor = process.env.AUTH_SECRET): string {
  if (!valor) throw new Error("Falta la variable de entorno AUTH_SECRET.");
  return valor;
}

const firma = (datos: string, s: string) => createHmac("sha256", s).update(datos).digest("base64url");

export function firmarEstado(e: EstadoOAuth, s?: string): string {
  const datos = Buffer.from(JSON.stringify(e)).toString("base64url");
  return `${datos}.${firma(datos, secreto(s))}`;
}

export function verificarEstado(estado: string, ahora = Date.now(), s?: string): EstadoOAuth | null {
  const [datos, f] = estado.split(".");
  if (!datos || !f) return null;
  const esperada = Buffer.from(firma(datos, secreto(s)));
  const recibida = Buffer.from(f);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const e = JSON.parse(Buffer.from(datos, "base64url").toString("utf8")) as EstadoOAuth;
    return typeof e.canalId === "string" && typeof e.userId === "string" && e.vence > ahora ? e : null;
  } catch {
    return null;
  }
}
