// Guardar respaldos en el disco del servidor, con rotación.

import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { Db } from "./db";
import { comprimir, crearRespaldo, resumenRespaldo } from "./respaldo";

export function dirRespaldos(): string {
  // Fuera de la carpeta de la app: un nuevo despliegue no los borra.
  return process.env.RESPALDOS_DIR || path.join(homedir(), "respaldos-panel");
}

const PATRON = /^respaldo-\d{8}-\d{6}\.json\.gz$/;

export async function guardarRespaldoEnDisco(db: Db, opciones: { archivo?: string; dir?: string; maximo?: number; ahora?: Date } = {}) {
  const ahora = opciones.ahora ?? new Date();
  const dir = opciones.dir ?? dirRespaldos();
  const sello = ahora.toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  const archivo = opciones.archivo ?? path.join(dir, `respaldo-${sello}.json.gz`);
  const r = await crearRespaldo(db, ahora);
  const datos = comprimir(r);
  await mkdir(path.dirname(archivo), { recursive: true });
  await writeFile(archivo, datos, { mode: 0o600 });

  const maximo = opciones.maximo ?? (Number(process.env.RESPALDOS_MAX) || 14);
  const borrados: string[] = [];
  if (!opciones.archivo) {
    const todos = (await readdir(dir)).filter((n) => PATRON.test(n)).sort();
    for (const viejo of todos.slice(0, Math.max(0, todos.length - maximo))) {
      await unlink(path.join(dir, viejo));
      borrados.push(viejo);
    }
  }
  return { archivo, bytes: datos.length, filas: resumenRespaldo(r), borrados };
}

export async function listarRespaldos(dir = dirRespaldos()) {
  try {
    const nombres = (await readdir(dir)).filter((n) => PATRON.test(n)).sort().reverse();
    return await Promise.all(nombres.map(async (n) => ({ nombre: n, bytes: (await stat(path.join(dir, n))).size })));
  } catch {
    return [];
  }
}
