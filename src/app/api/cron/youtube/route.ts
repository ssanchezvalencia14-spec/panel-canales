import { NextResponse, type NextRequest } from "next/server";
import { cronAutorizado } from "@/lib/cron";
import { prisma } from "@/lib/prisma-global";
import { sincronizarCanalesPublicos } from "@/server/youtube-publico";

// Tarea periódica (cron del hosting): lee los datos públicos de YouTube de todos
// los canales vinculados por enlace. Se recomienda cada 15 o 30 minutos.
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/cron/youtube
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!cronAutorizado(req.headers.get("authorization"))) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const resultados = await sincronizarCanalesPublicos(prisma, { minutos: 10 });
  return NextResponse.json({ ok: resultados.every((r) => r.ok), resultados });
}

export const POST = GET;
