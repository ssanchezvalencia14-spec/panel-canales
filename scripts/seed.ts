// Carga inicial: canales desde datos/canales/*.json, su agenda si existe
// (datos/agendas/<slug>.md) y el superadmin indicado en SUPERADMIN_EMAIL.
//
//   npm run db:seed

import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { crearPrisma } from "@/lib/db";
import { guardarCanal, validarConfigCanal } from "@/lib/canales";
import { importarAgenda } from "@/lib/agenda/importar";
import { crearOActualizarUsuario } from "@/lib/usuarios";

const RAIZ = path.resolve(import.meta.dirname, "..");
const DIR_CANALES = path.join(RAIZ, "datos", "canales");
const DIR_AGENDAS = path.join(RAIZ, "datos", "agendas");

async function main() {
  const db = crearPrisma();
  try {
    const archivos = (await readdir(DIR_CANALES)).filter((f) => f.endsWith(".json")).sort();
    if (archivos.length === 0) console.warn("No hay canales en datos/canales/.");

    for (const archivo of archivos) {
      const config = validarConfigCanal(JSON.parse(await readFile(path.join(DIR_CANALES, archivo), "utf8")));
      const canal = await guardarCanal(db, config);
      console.log(`Canal «${canal.nombre}» (${canal.slug}) listo.`);

      const agenda = path.join(DIR_AGENDAS, `${config.slug}.md`);
      if (existsSync(agenda)) {
        const r = await importarAgenda(db, config.slug, await readFile(agenda, "utf8"), {
          anioPorDefecto: Number(process.env.AGENDA_ANIO) || undefined,
        });
        console.log(`  Agenda: ${r.creados} creados, ${r.actualizados} actualizados, ${r.sinCambios} sin cambios.`);
        for (const aviso of r.avisos) console.warn(`  Aviso: ${aviso}`);
      } else {
        console.log(`  Sin agenda (falta datos/agendas/${config.slug}.md).`);
      }
    }

    const email = process.env.SUPERADMIN_EMAIL?.trim();
    if (email) {
      await crearOActualizarUsuario(db, { email, superadmin: true });
      console.log(`Superadmin: ${email}`);
    } else {
      console.warn("SUPERADMIN_EMAIL no está definido: nadie podrá entrar todavía.");
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
