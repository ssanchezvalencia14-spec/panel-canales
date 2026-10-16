import { NextResponse, type NextRequest } from "next/server";
import { cronAutorizado } from "@/lib/cron";
import { log } from "@/lib/log";
import { prisma } from "@/lib/prisma-global";
import { guardarRespaldoEnDisco } from "@/lib/respaldo-disco";

// Cron diario de copia de seguridad: guarda un .json.gz en RESPALDOS_DIR
// (por defecto ~/respaldos-panel, fuera de la app) y rota los antiguos.
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/cron/respaldo
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!cronAutorizado(req.headers.get("authorization"))) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  try {
    const r = await guardarRespaldoEnDisco(prisma);
    log.info("respaldo_ok", { bytes: r.bytes, borrados: r.borrados.length });
    // No se expone la ruta completa del servidor.
    return NextResponse.json({ ok: true, archivo: r.archivo.split(/[\\/]/).pop(), bytes: r.bytes, filas: r.filas, rotados: r.borrados.length });
  } catch (e) {
    log.error("respaldo_fallido", { error: e });
    return NextResponse.json({ ok: false, error: "No se pudo crear el respaldo (ver logs del servidor)." }, { status: 500 });
  }
}

export const POST = GET;
