// Cifrado simétrico para secretos guardados en la base (refresh tokens de Google).
// AES-256-GCM con la clave de INTEGRACIONES_CLAVE (32 bytes en base64 o hex).

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function clave(valor = process.env.INTEGRACIONES_CLAVE): Buffer {
  if (!valor) throw new Error("Falta la variable de entorno INTEGRACIONES_CLAVE.");
  const buf = /^[0-9a-f]{64}$/i.test(valor) ? Buffer.from(valor, "hex") : Buffer.from(valor, "base64");
  if (buf.length !== 32) throw new Error("INTEGRACIONES_CLAVE debe tener 32 bytes (base64 o hex).");
  return buf;
}

/** Devuelve "v1:<iv>:<tag>:<datos>" en base64url. */
export function cifrar(texto: string, claveTexto?: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", clave(claveTexto), iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv, c.getAuthTag(), datos].map((x) => (typeof x === "string" ? x : x.toString("base64url"))).join(":");
}

export function descifrar(paquete: string, claveTexto?: string): string {
  const [v, iv, tag, datos] = paquete.split(":");
  if (v !== "v1" || !iv || !tag || !datos) throw new Error("Secreto cifrado con formato desconocido.");
  const d = createDecipheriv("aes-256-gcm", clave(claveTexto), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(datos, "base64url")), d.final()]).toString("utf8");
}
