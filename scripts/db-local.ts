// Base MySQL local y efímera para desarrollo (sin instalar MySQL ni Docker).
// Descarga MySQL la primera vez, aplica migraciones y la carga inicial,
// y queda corriendo hasta Ctrl+C. Los datos se pierden al cerrarla.
//
//   npm run db:local
//   (en otra terminal) DATABASE_URL=mysql://root@127.0.0.1:3307/panel npm run dev

import "dotenv/config";
import { execSync } from "node:child_process";
import { createDB } from "mysql-memory-server";

const PUERTO = Number(process.env.DB_LOCAL_PUERTO || 3307);

async function main() {
  console.log("Arrancando MySQL local (la primera vez descarga el binario)…");
  const db = await createDB({ version: "8.4.x", dbName: "panel", port: PUERTO, xEnabled: "OFF" });
  const url = `mysql://${db.username}@127.0.0.1:${db.port}/${db.dbName}`;
  const env = { ...process.env, DATABASE_URL: url };

  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  execSync("npx tsx scripts/seed.ts", { stdio: "inherit", env });

  console.log(`\nMySQL local listo.\nDATABASE_URL=${url}\nCtrl+C para detenerlo.\n`);
  const detener = async () => {
    await db.stop();
    process.exit(0);
  };
  process.on("SIGINT", detener);
  process.on("SIGTERM", detener);
  setInterval(() => {}, 1 << 30);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
