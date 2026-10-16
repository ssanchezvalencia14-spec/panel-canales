import { NextResponse } from "next/server";
import { log } from "@/lib/log";
import { prisma } from "@/lib/prisma-global";
import { comprimir, crearRespaldo } from "@/lib/respaldo";
import { auth } from "@/auth";
import { puedeAdministrarRed } from "@/lib/dominio/roles";
import { cargarUsuario } from "@/server/acceso";

// Descarga de un respaldo al momento. Solo superadmin de la red.
export const maxDuration = 120;

export async function GET() {
  const id = (await auth())?.user?.id;
  const u = id ? await cargarUsuario(prisma, id) : null;
  if (!u || !puedeAdministrarRed(u)) return NextResponse.json({ error: "no autorizado" }, { status: 403 });
  try {
    const ahora = new Date();
    const datos = comprimir(await crearRespaldo(prisma, ahora));
    log.info("respaldo_descargado", { usuario: u.email, bytes: datos.length });
    const nombre = `respaldo-${ahora.toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-")}.json.gz`;
    return new NextResponse(new Uint8Array(datos), {
      headers: {
        "content-type": "application/gzip",
        "content-disposition": `attachment; filename="${nombre}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    log.error("respaldo_descarga_fallida", { error: e });
    return NextResponse.json({ error: "No se pudo crear el respaldo." }, { status: 500 });
  }
}
