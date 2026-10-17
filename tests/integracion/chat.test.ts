// Modo chat (sin API de Anthropic) contra MySQL real: el guion pegado crea una
// versión y el checklist de cifras, cuesta 0, no lo frenan los topes y respeta
// los roles; la investigación pegada queda como informe de la semana.

import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDB } from "mysql-memory-server";
import { crearPrisma, type Db } from "@/lib/db";
import { guardarCanal, validarConfigCanal } from "@/lib/canales";
import { crearOActualizarUsuario } from "@/lib/usuarios";
import { MARCAS } from "@/lib/ia/chat";
import { AccesoDenegado, cargarUsuario, type UsuarioSesion } from "@/server/acceso";
import { DatoInvalido } from "@/server/metricas";
import { cambiarTopeMensual, importarGuionDeChat } from "@/server/produccion";
import { importarInvestigacionDeChat, promptInvestigacionDeChat } from "@/server/automatizaciones";

let mysql: Awaited<ReturnType<typeof createDB>>;
let db: Db;
let A: string;
let videoId: string;
const u = {} as Record<"adminA" | "prodA" | "lectorA" | "prodB", UsuarioSesion>;

const respuesta = [
  MARCAS.guion,
  `# Guion\n\n${"Texto del guion con varias palabras. ".repeat(20)}[CIFRA: comisión media]`,
  MARCAS.cifras,
  "- [CIFRA: comisión media] | Superintendencia Financiera",
  "- 37 dólares al mes",
  MARCAS.notas,
  "",
  MARCAS.fin,
].join("\n");

beforeAll(async () => {
  mysql = await createDB({ version: "8.4.x", dbName: "panel_chat", xEnabled: "OFF" });
  const url = `mysql://${mysql.username}@127.0.0.1:${mysql.port}/${mysql.dbName}`;
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
  db = crearPrisma(url);
  const cfg = (slug: string) =>
    validarConfigCanal({
      slug,
      nombre: slug,
      zonaHoraria: "America/Bogota",
      horaPublicacion: "12:00",
      diasPublicacion: ["lun"],
      colorAcento: "#123456",
      pilares: ["P1"],
      // Topes en cero: con la API nada pasaría; el chat no gasta en el panel.
      reglas: { limiteGastoInvestigacion: 0, limiteGastoMensual: 0 },
      limiteGastoVideo: 0,
    });
  A = (await guardarCanal(db, cfg("canal-a"))).id;
  await guardarCanal(db, cfg("canal-b"));
  for (const [k, email, canal, rol] of [
    ["adminA", "admin@a.test", "canal-a", "admin"],
    ["prodA", "prod@a.test", "canal-a", "productor"],
    ["lectorA", "lector@a.test", "canal-a", "lector"],
    ["prodB", "prod@b.test", "canal-b", "productor"],
  ] as const) {
    const c = await crearOActualizarUsuario(db, { email, canal, rol });
    u[k] = (await cargarUsuario(db, c.id))!;
  }
  videoId = (await db.video.create({ data: { canalId: A, titulo: "Video", estado: "guion", fuentesOk: true } })).id;
});

afterAll(async () => {
  await db?.$disconnect();
  await mysql?.stop();
});

describe("guion desde el chat", () => {
  it("crea la versión, el checklist y una ejecución sin costo, aun con topes en cero", async () => {
    const r = await importarGuionDeChat(db, u.prodA, A, videoId, respuesta);
    expect(r).toMatchObject({ cifras: 2, costo: 0 });
    expect(r.guion).toMatchObject({ version: 1, modelo: "chat externo" });

    const tareas = await db.tarea.findMany({ where: { videoId }, orderBy: { creadoEn: "asc" } });
    expect(tareas.map((t) => t.descripcion)).toEqual(["[CIFRA: comisión media]\nFuente sugerida: Superintendencia Financiera", "37 dólares al mes"]);
    expect((await db.video.findUniqueOrThrow({ where: { id: videoId } })).fuentesOk).toBe(false);

    const ej = await db.ejecucion.findFirstOrThrow({ where: { videoId, tipo: "guion_ia" } });
    expect(ej.estado).toBe("ok");
    expect(Number(ej.costo)).toBe(0);
    expect(ej.log).toContain("chat externo");
    expect(ej.log).toContain("prod@a.test");
  });

  it("respeta roles y canal, y no deja rastro si la respuesta no se entiende", async () => {
    await expect(importarGuionDeChat(db, u.lectorA, A, videoId, respuesta)).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(importarGuionDeChat(db, u.prodB, A, videoId, respuesta)).rejects.toBeInstanceOf(AccesoDenegado);
    const antes = await db.ejecucion.count();
    await expect(importarGuionDeChat(db, u.prodA, A, videoId, "Claro, aquí va tu guion…")).rejects.toBeInstanceOf(DatoInvalido);
    expect(await db.ejecucion.count()).toBe(antes);
  });

  it("con tope mensual en cero, el chat sigue funcionando", async () => {
    await cambiarTopeMensual(db, u.adminA, A, 0);
    const v2 = await importarGuionDeChat(db, u.prodA, A, videoId, respuesta);
    expect(v2.guion.version).toBe(2);
  });
});

describe("investigación desde el chat", () => {
  it("solo un admin; queda como informe de la semana sin costo", async () => {
    const prompt = await promptInvestigacionDeChat(db, u.adminA, A);
    expect(prompt).toContain("búsqueda web");
    await expect(promptInvestigacionDeChat(db, u.prodA, A)).rejects.toBeInstanceOf(AccesoDenegado);

    const informe = `## Tendencias de la semana\n${"Una tendencia explicada. ".repeat(15)}\n- https://fuente.test/t\n\n## Fuentes\n- https://fuente.test/t`;
    await expect(importarInvestigacionDeChat(db, u.prodA, A, informe)).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(importarInvestigacionDeChat(db, u.adminA, A, "sin enlaces ".repeat(40))).rejects.toThrow(/enlaces/);

    const inf = await importarInvestigacionDeChat(db, u.adminA, A, informe);
    expect(inf).toMatchObject({ tipo: "investigacion", estado: "borrador", generadoPorId: u.adminA.id });
    expect(Number(inf.costo)).toBe(0);
    const ej = await db.ejecucion.findFirstOrThrow({ where: { canalId: A, tipo: "investigacion" } });
    expect(ej.log).toContain("chat externo");
  });
});
