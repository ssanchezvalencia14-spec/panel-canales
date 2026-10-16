// Una sola instancia de Prisma por proceso (en desarrollo sobrevive a la recarga
// en caliente). Sin "server-only" porque también la usa el proxy.

import { crearPrisma, type Db } from "./db";

const global = globalThis as unknown as { __prisma?: Db };

export const prisma: Db = global.__prisma ?? crearPrisma();
if (process.env.NODE_ENV !== "production") global.__prisma = prisma;
