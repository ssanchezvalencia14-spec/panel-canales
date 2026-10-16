import "dotenv/config";
import { defineConfig } from "prisma/config";

// Igual que en src/lib/db.ts: en Hostinger se conecta por 127.0.0.1, no «localhost».
const url = process.env["DATABASE_URL"]?.replace(/@localhost(?=[:/])/, "@127.0.0.1");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url,
  },
});
