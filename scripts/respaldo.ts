// Copia de seguridad de la base a un archivo .json.gz con rotación.
//   npm run respaldo                         → RESPALDOS_DIR (o ~/respaldos-panel)
//   npm run respaldo -- ruta/salida.json.gz  → archivo concreto, sin rotación
// Conserva los últimos RESPALDOS_MAX (14 por defecto).

import "dotenv/config";
import { crearPrisma } from "@/lib/db";
import { guardarRespaldoEnDisco } from "@/lib/respaldo-disco";

async function main() {
  const db = crearPrisma();
  try {
    const r = await guardarRespaldoEnDisco(db, { archivo: process.argv[2] });
    console.log(`Respaldo: ${r.archivo} (${(r.bytes / 1024).toFixed(1)} KB)`);
    for (const [t, n] of Object.entries(r.filas)) console.log(`  ${t}: ${n}`);
    if (r.borrados.length) console.log(`Rotación: se borraron ${r.borrados.length} respaldos antiguos.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
