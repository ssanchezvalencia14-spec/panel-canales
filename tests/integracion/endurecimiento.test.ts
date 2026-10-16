// Fase 6 contra MySQL real: copia de seguridad y restauración completas, tope
// de gasto mensual por canal y cron que no se cae por un canal con problemas.

import { execSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDB } from "mysql-memory-server";
import { crearPrisma, type Db } from "@/lib/db";
import { guardarCanal, validarConfigCanal } from "@/lib/canales";
import { crearOActualizarUsuario } from "@/lib/usuarios";
import { crearRespaldo, descomprimir, restaurarRespaldo } from "@/lib/respaldo";
import { guardarRespaldoEnDisco } from "@/lib/respaldo-disco";
import { AccesoDenegado, cargarUsuario, type UsuarioSesion } from "@/server/acceso";
import { cambiarTopeMensual, gastoMensualCanal, registrarEjecucion, TopeExcedido } from "@/server/produccion";
import { tareasDiarias } from "@/server/automatizaciones";

let mysql: Awaited<ReturnType<typeof createDB>>;
let db: Db;
let destino: Db;
let urlBase: string;
let A: string;
let B: string;
const u = {} as Record<"adminA" | "prodA" | "prodB", UsuarioSesion>;

beforeAll(async () => {
  mysql = await createDB({ version: "8.4.x", dbName: "panel_duro", xEnabled: "OFF" });
  urlBase = `mysql://${mysql.username}@127.0.0.1:${mysql.port}`;
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: `${urlBase}/${mysql.dbName}` } });
  db = crearPrisma(`${urlBase}/${mysql.dbName}`);
  const cfg = (slug: string) =>
    validarConfigCanal({
      slug,
      nombre: `Canal ${slug}`,
      zonaHoraria: "America/Bogota",
      horaPublicacion: "12:00",
      diasPublicacion: ["lun"],
      colorAcento: "#123456",
      pilares: ["P1"],
      reglas: { diasProduccionAntes: 3, voz: ["Frases cortas, «comillas» y ñ."] },
    });
  A = (await guardarCanal(db, cfg("canal-a"))).id;
  B = (await guardarCanal(db, cfg("canal-b"))).id;
  for (const [k, email, canal, rol] of [
    ["adminA", "admin@a.test", "canal-a", "admin"],
    ["prodA", "prod@a.test", "canal-a", "productor"],
    ["prodB", "prod@b.test", "canal-b", "productor"],
  ] as const) {
    const c = await crearOActualizarUsuario(db, { email, canal, rol });
    u[k] = (await cargarUsuario(db, c.id))!;
  }
  await db.video.create({
    data: { canalId: A, titulo: "Con fecha y JSON", estado: "guion", fechaPublicacion: new Date("2026-11-02T17:00:00.123Z"), puntajeGancho: { gancho: 80, flags: ["móvil"] } },
  });
  await db.session.create({ data: { sessionToken: "no-se-respalda", userId: u.prodA.id, expires: new Date(Date.now() + 864e5) } });
});

afterAll(async () => {
  await db?.$disconnect();
  await destino?.$disconnect();
  await mysql?.stop();
});

describe("tope de gasto mensual por canal", () => {
  it("bloquea lo que pasa el tope del mes, solo lo cambia un admin y no mezcla canales", async () => {
    await expect(cambiarTopeMensual(db, u.prodA, A, 1)).rejects.toBeInstanceOf(AccesoDenegado);
    await cambiarTopeMensual(db, u.adminA, A, 1);
    const sin = { videoId: null, estado: "ok" as const, salidaUrl: null, log: null };

    await registrarEjecucion(db, u.prodA, A, { ...sin, tipo: "voz", costo: 0.6 });
    await expect(registrarEjecucion(db, u.prodA, A, { ...sin, tipo: "imagenes", costo: 0.5 })).rejects.toBeInstanceOf(TopeExcedido);
    await registrarEjecucion(db, u.prodA, A, { ...sin, tipo: "imagenes", costo: 0.4 });

    // El canal B no tiene tope ni ve el gasto de A.
    await registrarEjecucion(db, u.prodB, B, { ...sin, tipo: "voz", costo: 5 });
    const mes = await gastoMensualCanal(db, u.prodA, A);
    expect(mes).toMatchObject({ gastado: 1, tope: 1 });
    expect(mes.porTipo.map((g) => g.tipo).sort()).toEqual(["imagenes", "voz"]);
    await expect(gastoMensualCanal(db, u.prodB, A)).rejects.toBeInstanceOf(AccesoDenegado);

    // Una ejecución del mes pasado no cuenta.
    await db.ejecucion.updateMany({ where: { canalId: A, tipo: "voz" }, data: { creadoEn: new Date("2020-01-15T12:00:00Z") } });
    expect((await gastoMensualCanal(db, u.prodA, A)).gastado).toBeCloseTo(0.4, 4);

    await cambiarTopeMensual(db, u.adminA, A, null);
    expect((await gastoMensualCanal(db, u.prodA, A)).tope).toBeNull();
    const reglas = (await db.canal.findUniqueOrThrow({ where: { id: A } })).reglas as Record<string, unknown>;
    expect(reglas.voz).toEqual(["Frases cortas, «comillas» y ñ."]); // no pisa el resto de reglas
  });
});

describe("cron diario", () => {
  it("un canal que falla no impide revisar los demás", async () => {
    // Zona horaria corrupta en B (solo posible tocando la base a mano).
    await db.canal.update({ where: { id: B }, data: { zonaHoraria: "Zona/Inexistente" } });
    const r = await tareasDiarias(db, new Date("2026-10-26T13:00:00Z"));
    expect(r.find((x) => x.canal === "canal-a")).toMatchObject({ ok: true });
    expect(r.find((x) => x.canal === "canal-b")).toMatchObject({ ok: false });
    await db.canal.update({ where: { id: B }, data: { zonaHoraria: "America/Bogota" } });
  });
});

describe("copias de seguridad", () => {
  it("respalda todo menos sesiones y restaura idéntico en una base vacía", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "respaldos-"));
    try {
      // Rotación: con máximo 2 se conservan los dos más recientes.
      for (const [i, h] of ["01", "02", "03"].entries()) {
        await guardarRespaldoEnDisco(db, { dir, maximo: 2, ahora: new Date(`2026-10-1${i}T${h}:00:00Z`) });
      }
      const archivos = (await readdir(dir)).sort();
      expect(archivos).toEqual(["respaldo-20261011-020000.json.gz", "respaldo-20261012-030000.json.gz"]);

      const r = descomprimir(await readFile(path.join(dir, archivos[1])));
      expect(Object.keys(r.tablas)).not.toContain("sessions");
      expect(Object.keys(r.tablas)).not.toContain("verification_tokens");
      expect(r.tablas.users.filas.length).toBe(3);

      // Base nueva, migrada y vacía.
      await db.$executeRawUnsafe("CREATE DATABASE panel_restaurado");
      execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: `${urlBase}/panel_restaurado` } });
      destino = crearPrisma(`${urlBase}/panel_restaurado`);
      const filas = await restaurarRespaldo(destino, r);
      expect(filas.canales).toBe(2);

      const original = await crearRespaldo(db);
      const copia = await crearRespaldo(destino);
      expect(copia.tablas).toEqual(original.tablas);

      const v = await destino.video.findFirstOrThrow({ where: { canalId: A } });
      expect(v.fechaPublicacion?.toISOString()).toBe("2026-11-02T17:00:00.123Z");
      expect(v.puntajeGancho).toEqual({ gancho: 80, flags: ["móvil"] });
      expect(await destino.session.count()).toBe(0);

      // Nunca sobre una base con datos.
      await expect(restaurarRespaldo(destino, r)).rejects.toThrow(/ya tiene datos/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
