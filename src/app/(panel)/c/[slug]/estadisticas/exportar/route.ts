import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma-global";
import { cargarUsuario, obtenerCanalPorSlug } from "@/server/acceso";
import { exportarEstadisticasCsv } from "@/server/metricas";

// Descarga de las métricas del canal en CSV (cualquier miembro puede verlas).
export async function GET(_req: Request, ctx: RouteContext<"/c/[slug]/estadisticas/exportar">) {
  const { slug } = await ctx.params;
  const sesion = await auth();
  const usuario = sesion?.user?.id ? await cargarUsuario(prisma, sesion.user.id) : null;
  if (!usuario) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal) return NextResponse.json({ error: "no encontrado" }, { status: 404 });

  const csv = await exportarEstadisticasCsv(prisma, usuario, canal.id);
  const fecha = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="metricas-${canal.slug}-${fecha}.csv"`,
      "cache-control": "no-store",
    },
  });
}
