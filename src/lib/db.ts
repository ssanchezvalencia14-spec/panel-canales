// Cliente de Prisma para MySQL con el adaptador de MariaDB (compatible con MySQL).
// Lo usan tanto la app como los scripts (seed, importador, tests).

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

export type Db = PrismaClient;

/**
 * En Hostinger la app debe conectarse a 127.0.0.1: «localhost» puede resolver
 * a IPv6 (::1) y no todos los usuarios de MySQL tienen ese permiso.
 */
export function normalizarUrlMysql(url: string): string {
  return url.replace(/@localhost(?=[:/])/, "@127.0.0.1");
}

export function crearPrisma(url = process.env.DATABASE_URL): PrismaClient {
  if (!url) {
    throw new Error("Falta la variable de entorno DATABASE_URL.");
  }
  const adapter = new PrismaMariaDb(normalizarUrlMysql(url));
  return new PrismaClient({ adapter });
}
