// Importa una agenda Markdown a un canal existente.
//
//   npm run agenda:importar -- --canal mi-canal --archivo ruta/AGENDA.md [--anio 2026] [--simular]

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { crearPrisma } from "@/lib/db";
import { importarAgenda } from "@/lib/agenda/importar";
import { parsearAgenda } from "@/lib/agenda/parsear";

const { values } = parseArgs({
  options: {
    canal: { type: "string" },
    archivo: { type: "string" },
    anio: { type: "string" },
    simular: { type: "boolean", default: false },
  },
});

async function main() {
  if (!values.canal || !values.archivo) throw new Error("Uso: --canal <slug> --archivo <ruta.md>");
  const markdown = await readFile(values.archivo, "utf8");
  const opciones = { anioPorDefecto: values.anio ? Number(values.anio) : undefined };

  if (values.simular) {
    const { entradas, avisos } = parsearAgenda(markdown, opciones);
    console.table(entradas.map((e) => ({ fecha: e.fecha ?? "—", titulo: e.titulo, pilar: e.pilar ?? "—" })));
    for (const a of avisos) console.warn(`Aviso: ${a}`);
    console.log(`${entradas.length} videos leídos (simulación, nada se guardó).`);
    return;
  }

  const db = crearPrisma();
  try {
    const r = await importarAgenda(db, values.canal, markdown, opciones);
    console.log(`${r.creados} creados, ${r.actualizados} actualizados, ${r.sinCambios} sin cambios.`);
    for (const a of r.avisos) console.warn(`Aviso: ${a}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
