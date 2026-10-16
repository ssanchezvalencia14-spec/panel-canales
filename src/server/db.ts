import "server-only";
import { crearPrisma, type Db } from "@/lib/db";

// Una sola instancia por proceso (en desarrollo sobrevive a la recarga en caliente).
const global = globalThis as unknown as { __prisma?: Db };

export const prisma: Db = global.__prisma ?? crearPrisma();
if (process.env.NODE_ENV !== "production") global.__prisma = prisma;
