import { NextResponse, type NextRequest } from "next/server";
import { cronAutorizado } from "@/lib/cron";
import { prisma } from "@/lib/prisma-global";
import { investigadorClaude } from "@/lib/ia/investigacion";
import { tareasSemanales } from "@/server/automatizaciones";

// Cron semanal: resumen de la semana en borrador (lo aprueba un admin) e
// investigación de referencias si hay ANTHROPIC_API_KEY.
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/cron/semanal
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!cronAutorizado(req.headers.get("authorization"))) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const investigar = process.env.ANTHROPIC_API_KEY ? investigadorClaude() : null;
  return NextResponse.json({ ok: true, canales: await tareasSemanales(prisma, investigar) });
}

export const POST = GET;
