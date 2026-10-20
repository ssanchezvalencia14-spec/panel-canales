// Un canal nuevo no debe quedar visible solo para el superadmin: al crearlo,
// el equipo actual recibe acceso con su rol habitual.

import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDB } from "mysql-memory-server";
import { crearPrisma, type Db } from "@/lib/db";
import { guardarCanal, validarConfigCanal } from "@/lib/canales";
import { crearOActualizarUsuario } from "@/lib/usuarios";
import { AccesoDenegado, cargarUsuario, contarMiembrosPorCanal, listarCanales } from "@/server/acceso";
import { darAccesoAlEquipo } from "@/server/youtube-publico";

let mysql: Awaited<ReturnType<typeof createDB>>;
let db: Db;

const cfg = (slug: string) =>
  validarConfigCanal({ slug, nombre: slug, zonaHoraria: "America/Bogota", horaPublicacion: "12:00", diasPublicacion: ["lun"], colorAcento: "#123456", pilares: ["P1"] });

beforeAll(async () => {
  mysql = await createDB({ version: "8.4.x", dbName: "panel_equipo", xEnabled: "OFF" });
  const url = `mysql://${mysql.username}@127.0.0.1:${mysql.port}/${mysql.dbName}`;
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
  db = crearPrisma(url);
  await guardarCanal(db, cfg("canal-a"));
  await guardarCanal(db, cfg("canal-b"));
  await crearOActualizarUsuario(db, { email: "admin@red.test", canal: "canal-a", rol: "admin" });
  await crearOActualizarUsuario(db, { email: "admin@red.test", canal: "canal-b", rol: "admin" });
  await crearOActualizarUsuario(db, { email: "mixto@red.test", canal: "canal-a", rol: "admin" });
  await crearOActualizarUsuario(db, { email: "mixto@red.test", canal: "canal-b", rol: "productor" });
  const baja = await crearOActualizarUsuario(db, { email: "baja@red.test", canal: "canal-a", rol: "lector" });
  await db.user.update({ where: { id: baja.id }, data: { activo: false } });
  await crearOActualizarUsuario(db, { email: "super@red.test", superadmin: true });
});

afterAll(async () => {
  await db?.$disconnect();
  await mysql?.stop();
});

describe("acceso del equipo a un canal nuevo", () => {
  it("cada persona activa recibe su rol habitual; inactivos y superadmins no", async () => {
    const nuevo = await guardarCanal(db, cfg("canal-nuevo"));
    expect(await darAccesoAlEquipo(db, nuevo.id)).toBe(2);

    const m = await db.membresia.findMany({ where: { canalId: nuevo.id }, include: { user: { select: { email: true } } } });
    expect(Object.fromEntries(m.map((x) => [x.user.email, x.rol]))).toEqual({ "admin@red.test": "admin", "mixto@red.test": "productor" });

    // El equipo ya lo ve en su lista de canales.
    const mixto = await cargarUsuario(db, (await db.user.findUniqueOrThrow({ where: { email: "mixto@red.test" } })).id);
    expect((await listarCanales(db, mixto!)).map((c) => c.slug)).toContain("canal-nuevo");

    // Repetirlo no duplica ni falla.
    expect(await darAccesoAlEquipo(db, nuevo.id)).toBe(0);
  });

  it("el conteo de equipo por canal es solo para el superadmin", async () => {
    const sup = await cargarUsuario(db, (await db.user.findUniqueOrThrow({ where: { email: "super@red.test" } })).id);
    const admin = await cargarUsuario(db, (await db.user.findUniqueOrThrow({ where: { email: "admin@red.test" } })).id);
    const conteo = await contarMiembrosPorCanal(db, sup!);
    const a = await db.canal.findUniqueOrThrow({ where: { slug: "canal-a" } });
    expect(conteo.get(a.id)).toBe(2); // el inactivo no cuenta
    await expect(contarMiembrosPorCanal(db, admin!)).rejects.toBeInstanceOf(AccesoDenegado);
  });
});
