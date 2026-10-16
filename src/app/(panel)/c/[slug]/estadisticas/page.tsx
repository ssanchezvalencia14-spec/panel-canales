import { notFound } from "next/navigation";
import { leerPilares } from "@/lib/dominio/canal-config";
import { ESTADOS_VIDEO, NOMBRE_ESTADO } from "@/lib/dominio/estados";
import { prisma } from "@/server/db";
import { listarVideosDeCanal, obtenerCanalPorSlug } from "@/server/acceso";
import { requireUsuario } from "@/server/sesion";

function Barra({ etiqueta, valor, total }: { etiqueta: string; valor: number; total: number }) {
  const pct = total ? Math.round((valor / total) * 100) : 0;
  return (
    <li className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-3 text-sm">
      <span className="truncate text-suave">{etiqueta}</span>
      <span className="h-2 overflow-hidden rounded-full bg-fondo">
        <span className="block h-full rounded-full bg-acento" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-right tabular-nums">{valor}</span>
    </li>
  );
}

export default async function Estadisticas({ params }: PageProps<"/c/[slug]/estadisticas">) {
  const { slug } = await params;
  const usuario = await requireUsuario();
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal) notFound();

  const videos = await listarVideosDeCanal(prisma, usuario, canal.id);
  const pilares = leerPilares(canal.pilares);
  const sinPilar = videos.filter((v) => !v.pilar || !pilares.includes(v.pilar)).length;

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-borde bg-superficie p-4">
        <h2 className="font-semibold">Videos por estado</h2>
        <ul className="mt-4 space-y-2">
          {ESTADOS_VIDEO.map((e) => (
            <Barra key={e} etiqueta={NOMBRE_ESTADO[e]} valor={videos.filter((v) => v.estado === e).length} total={videos.length} />
          ))}
        </ul>
      </div>
      <div className="rounded-lg border border-borde bg-superficie p-4">
        <h2 className="font-semibold">Videos por pilar</h2>
        <ul className="mt-4 space-y-2">
          {pilares.map((p) => (
            <Barra key={p} etiqueta={p} valor={videos.filter((v) => v.pilar === p).length} total={videos.length} />
          ))}
          {sinPilar > 0 && <Barra etiqueta="Sin pilar" valor={sinPilar} total={videos.length} />}
        </ul>
      </div>
      <div className="rounded-lg border border-dashed border-borde p-4 text-sm text-suave lg:col-span-2">
        Las métricas de YouTube y TikTok (vistas, retención, CTR) llegan con la integración de datos. Por ahora no hay
        métricas cargadas.
      </div>
    </section>
  );
}
