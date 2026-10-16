// Logs estructurados (una línea JSON por evento) para leerlos en los registros
// del hosting. Nunca se registran claves, tokens ni el contenido de correos.

import { randomBytes } from "node:crypto";

type Nivel = "info" | "aviso" | "error";
type Campos = Record<string, unknown>;

const SENSIBLE = /pass|secret|token|clave|key|authorization|cookie/i;

/** Quita valores sensibles y corta textos largos antes de escribir. */
export function limpiar(campos: Campos): Campos {
  const out: Campos = {};
  for (const [k, v] of Object.entries(campos)) {
    if (SENSIBLE.test(k)) out[k] = "[oculto]";
    else if (v instanceof Error) out[k] = { nombre: v.name, mensaje: v.message.slice(0, 500), pila: v.stack?.split("\n").slice(0, 6).join("\n") };
    else if (typeof v === "string") out[k] = v.length > 1000 ? `${v.slice(0, 1000)}…` : v;
    else out[k] = v;
  }
  return out;
}

export function registrar(nivel: Nivel, evento: string, campos: Campos = {}) {
  if (process.env.NODE_ENV === "test" && !process.env.LOG_EN_TEST) return;
  const linea = JSON.stringify({ t: new Date().toISOString(), nivel, evento, ...limpiar(campos) });
  if (nivel === "error") console.error(linea);
  else if (nivel === "aviso") console.warn(linea);
  else console.info(linea);
}

export const log = {
  info: (evento: string, campos?: Campos) => registrar("info", evento, campos),
  aviso: (evento: string, campos?: Campos) => registrar("aviso", evento, campos),
  error: (evento: string, campos?: Campos) => registrar("error", evento, campos),
};

/** Referencia corta para que el equipo cite un error sin ver detalles internos. */
export function referenciaError(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}
