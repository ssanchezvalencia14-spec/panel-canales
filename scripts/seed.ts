// Carga inicial e idempotente, toda desde datos (nada de canales en el código):
//  - datos/red.json            superadmins de la red
//  - datos/canales/*.json      canales, su equipo inicial y la ruta de su agenda
//  - SUPERADMIN_EMAIL          (opcional) un superadmin extra por entorno
//
//   npm run db:seed

import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { crearPrisma } from "@/lib/db";
import { esquemaRed, guardarCanal, validarSemillaCanal } from "@/lib/canales";
import { importarAgenda } from "@/lib/agenda/importar";
import { crearOActualizarUsuario } from "@/lib/usuarios";

const RAIZ = path.resolve(import.meta.dirname, "..");
const DIR_CANALES = path.join(RAIZ, "datos", "canales");
const ARCHIVO_RED = path.join(RAIZ, "datos", "red.json");

async function main() {
  const db = crearPrisma();
  try {
    const red = esquemaRed.parse(existsSync(ARCHIVO_RED) ? JSON.parse(await readFile(ARCHIVO_RED, "utf8")) : {});
    const extra = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
    const superadmins = [...new Set([...red.superadmins, ...(extra ? [extra] : [])])];
    for (const email of superadmins) {
      await crearOActualizarUsuario(db, { email, superadmin: true });
      console.log(`Superadmin: ${email}`);
    }
    if (superadmins.length === 0) console.warn("No hay superadmins: nadie podrá administrar la red.");

    const archivos = (await readdir(DIR_CANALES)).filter((f) => f.endsWith(".json")).sort();
    for (const archivo of archivos) {
      const semilla = validarSemillaCanal(JSON.parse(await readFile(path.join(DIR_CANALES, archivo), "utf8")));
      const canal = await guardarCanal(db, semilla);
      console.log(`Canal «${canal.nombre}» (${canal.slug}) listo.`);

      for (const m of semilla.equipo) {
        await crearOActualizarUsuario(db, { email: m.email, nombre: m.nombre, canal: semilla.slug, rol: m.rol });
        console.log(`  Equipo: ${m.email} · ${m.rol}`);
      }

      if (semilla.agenda) {
        const ruta = path.resolve(RAIZ, semilla.agenda);
        if (!ruta.startsWith(RAIZ) || !existsSync(ruta)) {
          console.warn(`  Agenda no encontrada: ${semilla.agenda}`);
          continue;
        }
        const r = await importarAgenda(db, semilla.slug, await readFile(ruta, "utf8"), {
          anioPorDefecto: Number(process.env.AGENDA_ANIO) || undefined,
        });
        console.log(`  Agenda: ${r.creados} creados, ${r.actualizados} actualizados, ${r.sinCambios} sin cambios.`);
        for (const aviso of r.avisos) console.warn(`  Aviso: ${aviso}`);
      }
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
