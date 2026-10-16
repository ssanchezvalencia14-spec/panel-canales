import { NextResponse, type NextRequest } from "next/server";
import { cronAutorizado } from "@/lib/cron";
import { log } from "@/lib/log";
import { prisma } from "@/lib/prisma-global";
import { tareasDiarias } from "@/server/automatizaciones";
import { limpiarCaducados } from "@/server/mantenimiento";

// Cron diario: abre y cierra alertas de todos los canales, avisa de las nuevas
// y borra sesiones y enlaces de acceso caducados.
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/cron/diario
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!cronAutorizado(req.headers.get("authorization"))) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const canales = await tareasDiarias(prisma);
  const limpieza = await limpiarCaducados(prisma).catch((e) => {
    log.error("limpieza_fallida", { error: e });
    return null;
  });
  const ok = canales.every((c) => c.ok);
  log.info("cron_diario", { canales: canales.length, conError: canales.filter((c) => !c.ok).length, limpieza });
  return NextResponse.json({ ok, canales, limpieza });
}

export const POST = GET;
