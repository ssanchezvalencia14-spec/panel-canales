import { NextResponse, type NextRequest } from "next/server";
import { cronAutorizado } from "@/lib/cron";
import { prisma } from "@/lib/prisma-global";
import { tareasDiarias } from "@/server/automatizaciones";

// Cron diario: abre y cierra alertas de todos los canales y avisa de las nuevas.
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/cron/diario
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!cronAutorizado(req.headers.get("authorization"))) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  return NextResponse.json({ ok: true, canales: await tareasDiarias(prisma) });
}

export const POST = GET;
