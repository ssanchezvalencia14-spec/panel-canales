// Restaura un respaldo .json.gz en una base RECIÉN MIGRADA Y VACÍA.
//   DATABASE_URL=<base nueva> npx prisma migrate deploy
//   DATABASE_URL=<base nueva> npm run restaurar -- ruta/respaldo.json.gz
// Se niega si la base ya tiene usuarios o canales.

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { crearPrisma } from "@/lib/db";
import { descomprimir, restaurarRespaldo } from "@/lib/respaldo";

async function main() {
  const archivo = process.argv[2];
  if (!archivo) throw new Error("Uso: npm run restaurar -- ruta/respaldo.json.gz");
  const r = descomprimir(await readFile(archivo));
  const db = crearPrisma();
  try {
    console.log(`Respaldo del ${r.creadoEn} (base ${r.base}).`);
    const filas = await restaurarRespaldo(db, r);
    for (const [t, n] of Object.entries(filas)) console.log(`  ${t}: ${n}`);
    console.log("Restauración completa. Cada persona vuelve a entrar con su correo (las sesiones no se respaldan).");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
