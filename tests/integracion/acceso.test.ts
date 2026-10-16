// Prueba contra un MySQL real (efímero, vía mysql-memory-server): aplica las
// migraciones, crea dos canales genéricos y verifica aislamiento y permisos.
// La primera ejecución descarga MySQL y puede tardar varios minutos.

import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDB } from "mysql-memory-server";
import { crearPrisma, type Db } from "@/lib/db";
import { guardarCanal, validarConfigCanal } from "@/lib/canales";
import { crearOActualizarUsuario } from "@/lib/usuarios";
import { importarAgenda } from "@/lib/agenda/importar";
import { validarConfigCanal as configValida } from "@/lib/canales";
import {
  agregarMiembro,
  cambiarRolMiembro,
  crearCanal,
  listarMiembros,
  quitarMiembro,
  usuarioDeSesion,
  cambiarEstadoVideo,
  cargarUsuario,
  listarCanales,
  listarVideosDeCanal,
  obtenerCanalPorSlug,
  resumenRed,
  AccesoDenegado,
  NoEncontrado,
  TransicionInvalida,
  type UsuarioSesion,
} from "@/server/acceso";

let mysql: Awaited<ReturnType<typeof createDB>>;
let db: Db;
let canalA: string;
let canalB: string;
const u: Record<"superadmin" | "adminA" | "productorA" | "revisorA" | "lectorB", UsuarioSesion> = {} as never;

const configCanal = (slug: string, nombre: string, color: string) =>
  validarConfigCanal({
    slug,
    nombre,
    zonaHoraria: "America/Bogota",
    horaPublicacion: "12:00",
    diasPublicacion: ["lun", "mie", "vie"],
    colorAcento: color,
    pilares: ["Pilar 1", "Pilar 2"],
  });

const AGENDA = [
  "| Fecha | Título | Pilar |",
  "|---|---|---|",
  "| 2026-10-19 | Video A1 | Pilar 1 |",
  "| 2026-10-21 | Video A2 | Pilar 2 |",
  "| 2026-10-23 | Video A3 | Pilar 1 |",
].join("\n");

beforeAll(async () => {
  mysql = await createDB({ version: "8.4.x", dbName: "panel_test", xEnabled: "OFF" });
  const url = `mysql://${mysql.username}@127.0.0.1:${mysql.port}/${mysql.dbName}`;
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
  db = crearPrisma(url);

  canalA = (await guardarCanal(db, configCanal("canal-a", "Canal A", "#112233"))).id;
  canalB = (await guardarCanal(db, configCanal("canal-b", "Canal B", "#445566"))).id;
  await importarAgenda(db, "canal-a", AGENDA);
  await importarAgenda(db, "canal-b", AGENDA.replaceAll("Video A", "Video B"));

  const alta = async (clave: keyof typeof u, email: string, extra: object) => {
    const creado = await crearOActualizarUsuario(db, { email, ...extra });
    u[clave] = (await cargarUsuario(db, creado.id))!;
  };
  await alta("superadmin", "sa@prueba.test", { superadmin: true });
  await alta("adminA", "admin@prueba.test", { canal: "canal-a", rol: "admin" });
  await alta("productorA", "prod@prueba.test", { canal: "canal-a", rol: "productor" });
  await alta("revisorA", "rev@prueba.test", { canal: "canal-a", rol: "revisor" });
  await alta("lectorB", "lector@prueba.test", { canal: "canal-b", rol: "lector" });
});

afterAll(async () => {
  await db?.$disconnect();
  await mysql?.stop();
});

async function videoDe(canalId: string, titulo: string) {
  return db.video.findFirstOrThrow({ where: { canalId, titulo } });
}

describe("migraciones e importación", () => {
  it("crea los videos de la agenda con la hora del canal en UTC", async () => {
    const v = await videoDe(canalA, "Video A1");
    expect(v.fechaPublicacion?.toISOString()).toBe("2026-10-19T17:00:00.000Z");
    expect(v.estado).toBe("idea");
  });

  it("la importación es idempotente", async () => {
    const r = await importarAgenda(db, "canal-a", AGENDA);
    expect(r).toMatchObject({ creados: 0, actualizados: 3 });
    expect(await db.video.count({ where: { canalId: canalA } })).toBe(3);
  });

  it("la base impide colgar una tarea de un video de otro canal", async () => {
    const vB = await videoDe(canalB, "Video B1");
    await expect(db.tarea.create({ data: { canalId: canalA, videoId: vB.id, tipo: "prueba" } })).rejects.toThrow();
  });
});

describe("aislamiento por canal", () => {
  it("cada usuario solo ve sus canales; el superadmin ve la red", async () => {
    expect((await listarCanales(db, u.productorA)).map((c) => c.slug)).toEqual(["canal-a"]);
    expect((await listarCanales(db, u.lectorB)).map((c) => c.slug)).toEqual(["canal-b"]);
    expect((await listarCanales(db, u.superadmin)).map((c) => c.slug)).toEqual(["canal-a", "canal-b"]);
  });

  it("un canal ajeno no existe para el usuario", async () => {
    expect(await obtenerCanalPorSlug(db, u.productorA, "canal-b")).toBeNull();
    await expect(listarVideosDeCanal(db, u.productorA, canalB)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it("la vista Red resume solo los canales visibles", async () => {
    const red = await resumenRed(db, u.lectorB, new Date("2026-10-01T00:00:00Z"));
    expect(red).toHaveLength(1);
    expect(red[0]).toMatchObject({ total: 3, proxima: { titulo: "Video B1" } });
  });

  it("no se puede mover un video de otro canal", async () => {
    const vB = await videoDe(canalB, "Video B2");
    await expect(cambiarEstadoVideo(db, u.adminA, vB.id, "guion")).rejects.toBeInstanceOf(NoEncontrado);
  });
});

describe("permisos y aprobación humana", () => {
  it("el lector no mueve videos", async () => {
    const vB = await videoDe(canalB, "Video B1");
    await expect(cambiarEstadoVideo(db, u.lectorB, vB.id, "guion")).rejects.toBeInstanceOf(TransicionInvalida);
  });

  it("flujo completo con firma de aprobación y reglas de fuentes", async () => {
    const { id } = await videoDe(canalA, "Video A1");
    // Desde la Fase 3 hace falta un gancho que alcance el objetivo para pasar de guion.
    await db.video.update({ where: { id }, data: { scoreGancho: 80 } });
    await cambiarEstadoVideo(db, u.productorA, id, "guion");
    await cambiarEstadoVideo(db, u.productorA, id, "verificacion");

    // Sin fuentes verificadas no pasa a producción.
    await expect(cambiarEstadoVideo(db, u.productorA, id, "produccion")).rejects.toThrow(/fuente/i);
    await db.video.update({ where: { id }, data: { fuentesOk: true } });
    await cambiarEstadoVideo(db, u.productorA, id, "produccion");
    await cambiarEstadoVideo(db, u.productorA, id, "revision");

    // El productor no aprueba; el revisor sí, y queda su firma.
    await expect(cambiarEstadoVideo(db, u.productorA, id, "aprobado")).rejects.toBeInstanceOf(TransicionInvalida);
    const aprobado = await cambiarEstadoVideo(db, u.revisorA, id, "aprobado");
    expect(aprobado.aprobadoPorId).toBe(u.revisorA.id);
    expect(aprobado.aprobadoEn).toBeInstanceOf(Date);

    // El revisor no programa; el admin sí.
    await expect(cambiarEstadoVideo(db, u.revisorA, id, "programado")).rejects.toBeInstanceOf(TransicionInvalida);
    const programado = await cambiarEstadoVideo(db, u.adminA, id, "programado");
    expect(programado.aprobadoPorId).toBe(u.revisorA.id);
  });

  it("volver a revisión retira la firma", async () => {
    const { id } = await videoDe(canalA, "Video A1");
    await cambiarEstadoVideo(db, u.adminA, id, "aprobado");
    const devuelto = await cambiarEstadoVideo(db, u.adminA, id, "revision");
    expect(devuelto.aprobadoPorId).toBeNull();
    expect(devuelto.aprobadoEn).toBeNull();
    await expect(cambiarEstadoVideo(db, u.adminA, id, "programado")).rejects.toBeInstanceOf(TransicionInvalida);
  });

  it("un usuario desactivado deja de tener sesión", async () => {
    await db.user.update({ where: { id: u.revisorA.id }, data: { activo: false } });
    expect(await cargarUsuario(db, u.revisorA.id)).toBeNull();
  });
});

describe("crear canal desde la UI", () => {
  const nuevo = () =>
    configValida({
      slug: "canal-c",
      nombre: "Canal C",
      zonaHoraria: "America/Mexico_City",
      horaPublicacion: "18:00",
      diasPublicacion: ["mar"],
      colorAcento: "#778899",
      pilares: ["Uno"],
    });

  it("solo el superadmin puede crear canales", async () => {
    await expect(crearCanal(db, u.adminA, nuevo())).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(crearCanal(db, u.productorA, nuevo())).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it("el superadmin crea un canal vacío, que nadie más ve", async () => {
    const c = await crearCanal(db, u.superadmin, nuevo());
    expect(await db.video.count({ where: { canalId: c.id } })).toBe(0);
    expect((await listarCanales(db, u.superadmin)).map((x) => x.slug)).toContain("canal-c");
    expect((await listarCanales(db, u.adminA)).map((x) => x.slug)).not.toContain("canal-c");
    expect(await obtenerCanalPorSlug(db, u.lectorB, "canal-c")).toBeNull();
  });

  it("no sobrescribe un canal existente", async () => {
    await expect(crearCanal(db, u.superadmin, nuevo())).rejects.toThrow(/Ya existe/);
  });
});

describe("gestión del equipo", () => {
  it("el admin agrega, cambia el rol y quita miembros de su canal", async () => {
    await agregarMiembro(db, u.adminA, canalA, { email: "Nuevo@Prueba.test", rol: "lector" });
    const nuevo = await db.user.findUniqueOrThrow({ where: { email: "nuevo@prueba.test" } });
    await cambiarRolMiembro(db, u.adminA, canalA, nuevo.id, "revisor");
    const miembros = await listarMiembros(db, u.adminA, canalA);
    expect(miembros.find((m) => m.user.id === nuevo.id)?.rol).toBe("revisor");
    await quitarMiembro(db, u.adminA, canalA, nuevo.id);
    expect((await listarMiembros(db, u.adminA, canalA)).some((m) => m.user.id === nuevo.id)).toBe(false);
  });

  it("un productor no gestiona el equipo", async () => {
    await expect(agregarMiembro(db, u.productorA, canalA, { email: "x@prueba.test", rol: "admin" })).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
  });

  it("un admin no gestiona el equipo de otro canal ni se cambia su propio rol", async () => {
    await expect(agregarMiembro(db, u.adminA, canalB, { email: "x@prueba.test", rol: "lector" })).rejects.toBeInstanceOf(
      AccesoDenegado,
    );
    await expect(listarMiembros(db, u.adminA, canalB)).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(cambiarRolMiembro(db, u.adminA, canalA, u.adminA.id, "lector")).rejects.toBeInstanceOf(AccesoDenegado);
  });
});

describe("sesión que lee el proxy", () => {
  it("devuelve los canales del usuario y rechaza sesiones vencidas", async () => {
    const vence = new Date(Date.now() + 3600_000);
    await db.session.create({ data: { sessionToken: "tok-prod", userId: u.productorA.id, expires: vence } });
    await db.session.create({ data: { sessionToken: "tok-viejo", userId: u.productorA.id, expires: new Date(Date.now() - 1000) } });
    expect(await usuarioDeSesion(db, "tok-prod")).toEqual({ esSuperadmin: false, slugs: ["canal-a"] });
    expect(await usuarioDeSesion(db, "tok-viejo")).toBeNull();
    expect(await usuarioDeSesion(db, "no-existe")).toBeNull();
  });
});
