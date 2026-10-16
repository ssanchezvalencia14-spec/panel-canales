// Copias de seguridad lógicas de la base: todas las tablas del panel a un JSON
// comprimido (gzip). No incluye sesiones ni enlaces de acceso pendientes (se
// regeneran solos) ni el historial de migraciones (lo crea «migrate deploy»).
// Los refresh tokens de Google van cifrados: sin INTEGRACIONES_CLAVE no sirven.

import { gunzipSync, gzipSync } from "node:zlib";
import type { Db } from "./db";

export const VERSION_RESPALDO = 1;
export const TABLAS_EXCLUIDAS = new Set(["sessions", "verification_tokens", "_prisma_migrations"]);

type Valor = string | number | boolean | null | { $fecha: string } | { $b64: string } | { $json: unknown };
export type Respaldo = {
  version: number;
  creadoEn: string;
  base: string;
  tablas: Record<string, { columnas: string[]; filas: Valor[][] }>;
};

const ident = (n: string) => {
  if (!/^[A-Za-z0-9_]+$/.test(n)) throw new Error(`Nombre de tabla o columna inesperado: ${n}`);
  return `\`${n}\``;
};

async function tablasDeLaBase(db: Db): Promise<string[]> {
  const filas = await db.$queryRawUnsafe<{ t: string }[]>(
    "SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
  );
  return filas.map((f) => f.t).filter((t) => !TABLAS_EXCLUIDAS.has(t));
}

async function columnas(db: Db, tabla: string): Promise<{ nombre: string; tipo: string }[]> {
  const filas = await db.$queryRawUnsafe<{ c: string; d: string }[]>(
    "SELECT COLUMN_NAME AS c, DATA_TYPE AS d FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
    tabla,
  );
  return filas.map((f) => ({ nombre: f.c, tipo: String(f.d).toLowerCase() }));
}

function codificar(v: unknown, tipo: string): Valor {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return { $fecha: v.toISOString() };
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return { $b64: Buffer.from(v).toString("base64") };
  if (tipo === "json") return { $json: typeof v === "string" ? JSON.parse(v) : v };
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "object") return String(v); // Decimal
  return v as string | number | boolean;
}

function decodificar(v: Valor): unknown {
  if (v === null || typeof v !== "object") return v;
  if ("$fecha" in v) return v.$fecha.replace("T", " ").replace("Z", "");
  if ("$b64" in v) return Buffer.from(v.$b64, "base64");
  return JSON.stringify(v.$json);
}

/** Lee toda la base (salvo exclusiones) y la devuelve como objeto serializable. */
export async function crearRespaldo(db: Db, ahora = new Date()): Promise<Respaldo> {
  const [{ base }] = await db.$queryRawUnsafe<{ base: string }[]>("SELECT DATABASE() AS base");
  const tablas: Respaldo["tablas"] = {};
  for (const t of await tablasDeLaBase(db)) {
    const cols = await columnas(db, t);
    const filas = await db.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM ${ident(t)}`);
    tablas[t] = { columnas: cols.map((c) => c.nombre), filas: filas.map((f) => cols.map((c) => codificar(f[c.nombre], c.tipo))) };
  }
  return { version: VERSION_RESPALDO, creadoEn: ahora.toISOString(), base, tablas };
}

export const comprimir = (r: Respaldo) => gzipSync(Buffer.from(JSON.stringify(r)), { level: 9 });

export function descomprimir(b: Buffer): Respaldo {
  const r = JSON.parse(gunzipSync(b).toString("utf8")) as Respaldo;
  if (r.version !== VERSION_RESPALDO || typeof r.tablas !== "object") throw new Error("El archivo no es un respaldo válido de este panel.");
  return r;
}

export function resumenRespaldo(r: Respaldo): Record<string, number> {
  return Object.fromEntries(Object.entries(r.tablas).map(([t, d]) => [t, d.filas.length]));
}

/**
 * Restaura un respaldo en una base con las migraciones aplicadas y SIN datos
 * (se niega si hay usuarios o canales: nunca pisa una base en uso).
 */
export async function restaurarRespaldo(db: Db, r: Respaldo) {
  const [{ n }] = await db.$queryRawUnsafe<{ n: bigint | number | string }[]>(
    "SELECT (SELECT COUNT(*) FROM `users`) + (SELECT COUNT(*) FROM `canales`) AS n",
  );
  if (Number(n) > 0) throw new Error("La base de destino ya tiene datos. Restaura solo sobre una base recién migrada y vacía.");
  const existentes = new Set(await tablasDeLaBase(db));
  const faltan = Object.keys(r.tablas).filter((t) => !existentes.has(t));
  if (faltan.length) throw new Error(`Faltan tablas en la base de destino (¿migraciones sin aplicar?): ${faltan.join(", ")}`);

  const insertadas: Record<string, number> = {};
  await db.$transaction(
    async (tx) => {
      // Misma conexión durante toda la transacción: el orden de las tablas no importa.
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
      for (const [t, d] of Object.entries(r.tablas)) {
        insertadas[t] = 0;
        if (d.filas.length === 0) continue;
        const cols = d.columnas.map(ident).join(", ");
        const marcas = `(${d.columnas.map(() => "?").join(", ")})`;
        for (let i = 0; i < d.filas.length; i += 200) {
          const lote = d.filas.slice(i, i + 200);
          await tx.$executeRawUnsafe(
            `INSERT INTO ${ident(t)} (${cols}) VALUES ${lote.map(() => marcas).join(", ")}`,
            ...lote.flatMap((f) => f.map(decodificar)),
          );
          insertadas[t] += lote.length;
        }
      }
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
    },
    { timeout: 300_000, maxWait: 10_000 },
  );
  return insertadas;
}
