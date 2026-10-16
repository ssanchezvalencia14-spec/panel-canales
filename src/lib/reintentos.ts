// Reintentos con espera exponencial para fallos pasajeros (red, 429, 5xx).
// Solo para operaciones idempotentes: repetirlas no duplica nada.

import { log } from "./log";

export type OpcionesReintento = {
  /** Intentos totales (el primero incluido). */
  intentos?: number;
  /** Espera base en ms; se duplica en cada intento, con algo de azar. */
  baseMs?: number;
  /** Espera máxima por intento (también limita Retry-After). */
  maxMs?: number;
  esperar?: (ms: number) => Promise<void>;
  etiqueta?: string;
};

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const ESTADOS_PASAJEROS = new Set([408, 429, 500, 502, 503, 504]);

export function esperaExponencial(intento: number, baseMs: number, maxMs: number, azar = Math.random()): number {
  return Math.min(maxMs, Math.round(baseMs * 2 ** (intento - 1) * (0.75 + azar * 0.5)));
}

/** «Retry-After» en segundos o como fecha HTTP. */
export function leerRetryAfter(valor: string | null, ahora = Date.now()): number | null {
  if (!valor) return null;
  const s = Number(valor);
  if (Number.isFinite(s)) return Math.max(0, s * 1000);
  const t = Date.parse(valor);
  return Number.isNaN(t) ? null : Math.max(0, t - ahora);
}

/** Envuelve fetch: reintenta GET/PUT/PATCH/DELETE (y los POST marcados) ante red caída, 429 o 5xx. */
export function fetchConReintentos(
  f: typeof fetch,
  opciones: OpcionesReintento & { postIdempotente?: (url: string) => boolean } = {},
): typeof fetch {
  const { intentos = 3, baseMs = 500, maxMs = 8000, esperar = dormir, etiqueta = "http", postIdempotente = () => false } = opciones;
  return (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const metodo = (init?.method ?? "GET").toUpperCase();
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.toString() : entrada.url;
    const repetible = metodo !== "POST" || postIdempotente(url);
    for (let i = 1; ; i++) {
      try {
        const r = await f(entrada, init);
        if (!repetible || i >= intentos || !ESTADOS_PASAJEROS.has(r.status)) return r;
        const ms = Math.min(maxMs, leerRetryAfter(r.headers.get("retry-after")) ?? esperaExponencial(i, baseMs, maxMs));
        log.aviso("reintento", { etiqueta, metodo, host: new URL(url).host, estado: r.status, intento: i, esperaMs: ms });
        await r.body?.cancel().catch(() => {});
        await esperar(ms);
      } catch (e) {
        if (!repetible || i >= intentos) throw e;
        const ms = esperaExponencial(i, baseMs, maxMs);
        log.aviso("reintento", { etiqueta, metodo, host: new URL(url).host, error: e instanceof Error ? e.message : String(e), intento: i, esperaMs: ms });
        await esperar(ms);
      }
    }
  }) as typeof fetch;
}

/** Reintenta una función async cualquiera cuando «reintentable» lo permite. */
export async function conReintentos<T>(
  fn: (intento: number) => Promise<T>,
  opciones: OpcionesReintento & { reintentable?: (e: unknown) => boolean } = {},
): Promise<T> {
  const { intentos = 2, baseMs = 1000, maxMs = 8000, esperar = dormir, etiqueta = "tarea", reintentable = () => true } = opciones;
  for (let i = 1; ; i++) {
    try {
      return await fn(i);
    } catch (e) {
      if (i >= intentos || !reintentable(e)) throw e;
      const ms = esperaExponencial(i, baseMs, maxMs);
      log.aviso("reintento", { etiqueta, intento: i, esperaMs: ms, error: e instanceof Error ? e.message : String(e) });
      await esperar(ms);
    }
  }
}
