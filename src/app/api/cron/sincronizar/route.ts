import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma-global";
import { sincronizarTodos } from "@/server/sincronizacion";

// Tarea periódica (cron del hosting): sincroniza todos los canales con Google.
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/cron/sincronizar
export const maxDuration = 300;

function autorizado(req: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || secreto.length < 16) return false;
  const recibido = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(recibido);
  const b = Buffer.from(secreto);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const resultados = await sincronizarTodos(prisma);
  return NextResponse.json({ ok: resultados.every((r) => r.ok), resultados });
}

export const POST = GET;
