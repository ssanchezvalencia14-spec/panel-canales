// Aceptación del seed real (datos/ + docs/) contra un MySQL efímero:
// canal #1 con 16 videos, superadmin y productores con su rol.

import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDB } from "mysql-memory-server";
import { crearPrisma, type Db } from "@/lib/db";
import { fechaLocal } from "@/lib/dominio/fechas";

let mysql: Awaited<ReturnType<typeof createDB>>;
let db: Db;

beforeAll(async () => {
  mysql = await createDB({ version: "8.4.x", dbName: "panel_seed", xEnabled: "OFF" });
  const url = `mysql://${mysql.username}@127.0.0.1:${mysql.port}/${mysql.dbName}`;
  const env = { ...process.env, DATABASE_URL: url, SUPERADMIN_EMAIL: "", AGENDA_ANIO: "" };
  execSync("npx prisma migrate deploy", { stdio: "pipe", env });
  execSync("npx tsx scripts/seed.ts", { stdio: "pipe", env });
  execSync("npx tsx scripts/seed.ts", { stdio: "pipe", env }); // idempotente
  db = crearPrisma(url);
});

afterAll(async () => {
  await db?.$disconnect();
  await mysql?.stop();
});

describe("seed", () => {
  it("crea el canal #1 con su configuración y 16 videos", async () => {
    const canal = await db.canal.findUniqueOrThrow({ where: { slug: "dinero-oculto" } });
    expect(canal).toMatchObject({
      nombre: "Dinero Oculto",
      idioma: "es",
      zonaHoraria: "America/Bogota",
      horaPublicacion: "12:00",
      colorAcento: "#E9B949",
      pilares: ["Bolsillo", "Cómo funciona", "Fortunas"],
    });
    const videos = await db.video.findMany({ where: { canalId: canal.id }, orderBy: { fechaPublicacion: "asc" } });
    expect(videos).toHaveLength(16);
    expect(videos.every((v) => v.fechaPublicacion && v.pilar)).toBe(true);
    expect(fechaLocal(videos[0].fechaPublicacion!, "America/Bogota")).toBe("2026-10-15");
    expect(videos[0].fechaPublicacion!.toISOString()).toBe("2026-10-15T17:00:00.000Z");
    expect(fechaLocal(videos[15].fechaPublicacion!, "America/Bogota")).toBe("2026-11-23");
    expect(videos.filter((v) => v.estado === "revision").map((v) => v.titulo)).toEqual(["Gota a gota"]);
    expect(videos.filter((v) => v.estado === "idea")).toHaveLength(15);
    expect(videos.some((v) => v.aprobadoPorId)).toBe(false);
  });

  it("crea el superadmin y los productores del canal", async () => {
    const sa = await db.user.findUniqueOrThrow({ where: { email: "ssanchezvalencia14@gmail.com" } });
    expect(sa.esSuperadmin).toBe(true);
    const miembros = await db.membresia.findMany({
      where: { canal: { slug: "dinero-oculto" } },
      select: { rol: true, user: { select: { email: true, esSuperadmin: true } } },
      orderBy: { user: { email: "asc" } },
    });
    expect(miembros).toEqual([
      { rol: "productor", user: { email: "juanpablogonzalez723@gmail.com", esSuperadmin: false } },
      { rol: "productor", user: { email: "michaelicloud26@gmail.com", esSuperadmin: false } },
    ]);
  });
});
