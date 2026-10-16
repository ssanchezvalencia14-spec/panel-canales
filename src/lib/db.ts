// Cliente de Prisma para MySQL con el adaptador de MariaDB (compatible con MySQL).
// Lo usan tanto la app como los scripts (seed, importador, tests).

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

export type Db = PrismaClient;

export function crearPrisma(url = process.env.DATABASE_URL): PrismaClient {
  if (!url) {
    throw new Error("Falta la variable de entorno DATABASE_URL.");
  }
  const adapter = new PrismaMariaDb(url);
  return new PrismaClient({ adapter });
}
