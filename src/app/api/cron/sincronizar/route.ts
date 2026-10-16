import { NextResponse, type NextRequest } from "next/server";
import { cronAutorizado } from "@/lib/cron";
import { prisma } from "@/lib/prisma-global";
import { sincronizarTodos } from "@/server/sincronizacion";

// Tarea periódica (cron del hosting): sincroniza todos los canales con Google.
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/cron/sincronizar
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!cronAutorizado(req.headers.get("authorization"))) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const resultados = await sincronizarTodos(prisma);
  return NextResponse.json({ ok: resultados.every((r) => r.ok), resultados });
}

export const POST = GET;
