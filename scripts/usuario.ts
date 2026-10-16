// Alta de un usuario y, opcionalmente, su rol en un canal.
//
//   npm run usuario:crear -- --email ana@ejemplo.com --nombre "Ana" --canal mi-canal --rol productor
//   npm run usuario:crear -- --email yo@ejemplo.com --superadmin

import "dotenv/config";
import { parseArgs } from "node:util";
import { crearPrisma } from "@/lib/db";
import { crearOActualizarUsuario } from "@/lib/usuarios";
import type { Rol } from "@/lib/dominio/roles";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    nombre: { type: "string" },
    canal: { type: "string" },
    rol: { type: "string" },
    superadmin: { type: "boolean", default: false },
  },
});

async function main() {
  if (!values.email) throw new Error("Falta --email.");
  const db = crearPrisma();
  try {
    const u = await crearOActualizarUsuario(db, {
      email: values.email,
      nombre: values.nombre,
      superadmin: values.superadmin,
      canal: values.canal,
      rol: values.rol as Rol | undefined,
    });
    const rol = values.canal ? ` · ${values.rol} en ${values.canal}` : "";
    console.log(`Usuario ${u.email}${u.esSuperadmin ? " (superadmin)" : ""}${rol}.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
