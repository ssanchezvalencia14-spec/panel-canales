// Fase 5 contra MySQL real. Aceptación: informe semanal y alertas funcionando
// una semana completa (se simulan 7 días seguidos del cron diario).

import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDB } from "mysql-memory-server";
import { crearPrisma, type Db } from "@/lib/db";
import { guardarCanal, validarConfigCanal } from "@/lib/canales";
import { crearOActualizarUsuario } from "@/lib/usuarios";
import type { Investigador } from "@/lib/ia/investigacion";
import { AccesoDenegado, cargarUsuario, type UsuarioSesion } from "@/server/acceso";
import { TopeExcedido } from "@/server/produccion";
import {
  alertasDeCanal,
  aprobarYEnviarResumen,
  generarInvestigacion,
  generarResumenSemanal,
  investigarAhora,
  sincronizarAlertas,
  tareasSemanales,
} from "@/server/automatizaciones";

let mysql: Awaited<ReturnType<typeof createDB>>;
let db: Db;
let A: string;
let B: string;
const u = {} as Record<"adminA" | "prodA" | "prodB", UsuarioSesion>;
const LUNES = new Date("2026-10-26T13:00:00Z"); // lun 26-oct 08:00 en Bogotá
const dia = (n: number) => new Date(LUNES.getTime() + n * 864e5);

let llamadas = 0;
const investigadorFalso: Investigador = async (p) => {
  llamadas++;
  return {
    informe: `## Tendencias de la semana\n- Tendencia (https://fuente.test/t)\n\n## Fuentes\n- https://fuente.test/t\n\nSemana ${p.semana}`,
    modelo: "claude-opus-5-5",
    uso: { input_tokens: 5000, output_tokens: 3000 },
    busquedas: 6,
    costo: 0.14,
    estimado: false,
  };
};

beforeAll(async () => {
  mysql = await createDB({ version: "8.4.x", dbName: "panel_auto", xEnabled: "OFF" });
  const url = `mysql://${mysql.username}@127.0.0.1:${mysql.port}/${mysql.dbName}`;
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
  db = crearPrisma(url);
  const cfg = (slug: string, reglas: Record<string, unknown> = {}) =>
    validarConfigCanal({
      slug,
      nombre: slug,
      zonaHoraria: "America/Bogota",
      horaPublicacion: "12:00",
      diasPublicacion: ["lun", "mie", "vie"],
      colorAcento: "#123456",
      pilares: ["P1"],
      reglas: { diasProduccionAntes: 3, colchonMinimo: 2, limiteGastoInvestigacion: 3, ...reglas },
    });
  A = (await guardarCanal(db, cfg("canal-a"))).id;
  B = (await guardarCanal(db, cfg("canal-b", { investigacionSemanal: false }))).id;
  for (const [k, email, canal, rol] of [
    ["adminA", "admin@a.test", "canal-a", "admin"],
    ["prodA", "prod@a.test", "canal-a", "productor"],
    ["prodB", "prod@b.test", "canal-b", "productor"],
  ] as const) {
    const c = await crearOActualizarUsuario(db, { email, canal, rol });
    u[k] = (await cargarUsuario(db, c.id))!;
  }
  // Canal A: publica mié 28 y vie 30 a las 12:00 Bogotá; uno ya aprobado para el lun 2-nov.
  await db.video.createMany({
    data: [
      { canalId: A, titulo: "Miércoles", estado: "guion", fechaPublicacion: new Date("2026-10-28T17:00:00Z") },
      { canalId: A, titulo: "Viernes", estado: "verificacion", fechaPublicacion: new Date("2026-10-30T17:00:00Z") },
      { canalId: A, titulo: "Lunes siguiente", estado: "aprobado", fuentesOk: true, fechaPublicacion: new Date("2026-11-02T17:00:00Z") },
    ],
  });
  const viernes = await db.video.findFirstOrThrow({ where: { canalId: A, titulo: "Viernes" } });
  await db.tarea.create({ data: { canalId: A, videoId: viernes.id, tipo: "verificacion_cifra", descripcion: "37 dólares" } });
});

afterAll(async () => {
  await db?.$disconnect();
  await mysql?.stop();
});

const abiertas = async () =>
  (await db.alerta.findMany({ where: { canalId: A, cerradaEn: null }, orderBy: { clave: "asc" } })).map((a) => a.clave.split(":")[0]);

describe("alertas durante una semana completa", () => {
  it("abren, se actualizan y cierran día a día", async () => {
    const v = async (t: string) => db.video.findFirstOrThrow({ where: { canalId: A, titulo: t } });

    // Lunes: Miércoles debía entrar a producción el domingo; hay cifras pendientes del Viernes;
    // solo 1 video listo (colchón 2).
    expect(await sincronizarAlertas(db, A, dia(0))).toMatchObject({ nuevas: 3, cerradas: 0 });
    expect(await abiertas()).toEqual(["atrasado_produccion", "cifras_sin_verificar", "colchon"]);
    const notificadas = await db.alerta.count({ where: { canalId: A, notificadaEn: { not: null } } });
    expect(notificadas).toBe(3);

    // Martes: llega el día de producción del «Viernes» (3 días antes) → una alerta nueva;
    // las demás siguen abiertas sin duplicarse ni volver a avisar.
    expect(await sincronizarAlertas(db, A, dia(1))).toMatchObject({ nuevas: 1, cerradas: 0, abiertas: 4 });
    expect(await db.alerta.count({ where: { canalId: A } })).toBe(4);

    // Miércoles 13:00 Bogotá: pasó la hora de publicación del «Miércoles» → atraso de publicación (reemplaza al de producción).
    expect(await sincronizarAlertas(db, A, new Date("2026-10-28T18:00:00Z"))).toMatchObject({ nuevas: 1, cerradas: 1 });

    // Jueves: se verifican las cifras del Viernes y se aprueba otro video → se cierran cifras y colchón.
    const viernes = await v("Viernes");
    await db.tarea.updateMany({ where: { videoId: viernes.id }, data: { estado: "hecha", fuenteUrl: "https://fuente.test" } });
    await db.video.update({ where: { id: viernes.id }, data: { fuentesOk: true } }); // lo que hace verificarCifra
    await db.video.create({ data: { canalId: A, titulo: "Miércoles siguiente", estado: "aprobado", fuentesOk: true, fechaPublicacion: new Date("2026-11-04T17:00:00Z") } });
    const jue = await sincronizarAlertas(db, A, dia(3));
    expect(jue.cerradas).toBe(2);
    // El Viernes (verificación, producción el martes) sigue atrasado de producción.
    expect(await abiertas()).toEqual(["atrasado_produccion", "atrasado_publicacion"]);

    // Viernes, sábado y domingo: se resuelven los atrasos.
    await db.video.update({ where: { id: (await v("Miércoles")).id }, data: { estado: "publicado" } });
    await sincronizarAlertas(db, A, dia(4));
    await db.video.update({ where: { id: viernes.id }, data: { estado: "programado" } });
    await sincronizarAlertas(db, A, dia(5));
    await sincronizarAlertas(db, A, dia(6));
    expect(await abiertas()).toEqual([]);

    const historial = await db.alerta.findMany({ where: { canalId: A } });
    expect(historial.length).toBe(5);
    expect(historial.every((a) => a.cerradaEn)).toBe(true);
    expect((await alertasDeCanal(db, u.prodA, A, 30)).length).toBeGreaterThanOrEqual(0);
    await expect(alertasDeCanal(db, u.prodB, A, 30)).rejects.toBeInstanceOf(AccesoDenegado);
  });
});

describe("resumen semanal aprobado por un admin", () => {
  it("queda en borrador, solo un admin lo envía con confirmación, y no se pisa una vez enviado", async () => {
    const r = await generarResumenSemanal(db, A, dia(6));
    expect(r).toMatchObject({ tipo: "resumen_semanal", semana: "2026-W44", estado: "borrador" });
    expect(r.contenido).toContain("# Resumen semanal · canal-a");
    expect(r.contenido).toContain("Lunes siguiente");

    await expect(aprobarYEnviarResumen(db, u.prodA, A, r.id, { contenido: r.contenido, confirmo: true })).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(aprobarYEnviarResumen(db, u.adminA, A, r.id, { contenido: r.contenido, confirmo: false })).rejects.toThrow(/confirmación/);
    await aprobarYEnviarResumen(db, u.adminA, A, r.id, { contenido: `${r.contenido}\nNota del admin.`, confirmo: true });

    const enviado = await db.informe.findUniqueOrThrow({ where: { id: r.id } });
    expect(enviado).toMatchObject({ estado: "enviado", aprobadoPorId: u.adminA.id });
    expect(enviado.contenido).toContain("Nota del admin.");
    expect(await db.actividad.count({ where: { canalId: A, accion: "aviso_equipo" } })).toBeGreaterThanOrEqual(1);

    const otra = await generarResumenSemanal(db, A, dia(6));
    expect(otra.id).toBe(r.id);
    expect(otra.contenido).toContain("Nota del admin.");
  });
});

describe("investigación de referencias", () => {
  it("guarda el informe con costo y log; respeta el tope y el rol", async () => {
    const inf = await generarInvestigacion(db, A, investigadorFalso, { ahora: dia(6) });
    expect(inf).toMatchObject({ tipo: "investigacion", semana: "2026-W44" });
    expect(Number(inf.costo)).toBeCloseTo(0.14, 4);
    const ej = await db.ejecucion.findFirstOrThrow({ where: { canalId: A, tipo: "investigacion" } });
    expect(ej.log).toContain("Búsquedas web: 6");

    await expect(investigarAhora(db, u.prodA, A, investigadorFalso, null)).rejects.toBeInstanceOf(AccesoDenegado);

    await db.canal.update({ where: { id: A }, data: { reglas: { diasProduccionAntes: 3, limiteGastoInvestigacion: 0.5 } } });
    const antes = llamadas;
    await expect(generarInvestigacion(db, A, investigadorFalso, { ahora: dia(6) })).rejects.toBeInstanceOf(TopeExcedido);
    expect(llamadas).toBe(antes);
    await db.canal.update({ where: { id: A }, data: { reglas: { diasProduccionAntes: 3, colchonMinimo: 2, limiteGastoInvestigacion: 3 } } });
  });

  it("el cron semanal deja resúmenes en borrador e investiga solo donde está habilitado", async () => {
    const r = await tareasSemanales(db, investigadorFalso, new Date("2026-11-02T13:00:00Z"));
    expect(r).toEqual([
      { canal: "canal-a", resumen: "borrador", investigacion: "ok" },
      { canal: "canal-b", resumen: "borrador", investigacion: "omitida" },
    ]);
    expect(await db.informe.count({ where: { canalId: B, tipo: "investigacion" } })).toBe(0);
  });
});
