import { notFound } from "next/navigation";
import { EstadoVideoChip } from "@/components/estado-video";
import { leerDias, leerPilares } from "@/lib/dominio/canal-config";
import { formatearFechaHora } from "@/lib/dominio/fechas";
import { prisma } from "@/server/db";
import { listarVideosDeCanal, obtenerCanalPorSlug } from "@/server/acceso";
import { requireUsuario } from "@/server/sesion";

const DIAS: Record<string, string> = { lun: "lun", mar: "mar", mie: "mié", jue: "jue", vie: "vie", sab: "sáb", dom: "dom" };

export default async function Videos({ params }: PageProps<"/c/[slug]/videos">) {
  const { slug } = await params;
  const usuario = await requireUsuario();
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal) notFound();

  const videos = await listarVideosDeCanal(prisma, usuario, canal.id);
  const pilares = leerPilares(canal.pilares);
  const dias = leerDias(canal.diasPublicacion)
    .map((d) => DIAS[d] ?? d)
    .join(", ");

  return (
    <section>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-lg border border-borde bg-superficie p-3">
          <dt className="text-suave">Publicación</dt>
          <dd className="mt-1">
            {dias} · {canal.horaPublicacion}
          </dd>
        </div>
        <div className="rounded-lg border border-borde bg-superficie p-3">
          <dt className="text-suave">Zona horaria e idioma</dt>
          <dd className="mt-1">
            {canal.zonaHoraria} · {canal.idioma}
          </dd>
        </div>
        <div className="rounded-lg border border-borde bg-superficie p-3">
          <dt className="text-suave">Pilares</dt>
          <dd className="mt-1">{pilares.join(" · ") || "Sin definir"}</dd>
        </div>
      </dl>

      <h2 className="mt-8 text-lg font-semibold">Videos ({videos.length})</h2>
      {videos.length === 0 ? (
        <p className="mt-3 rounded-lg border border-borde bg-superficie p-6 text-sm text-suave">
          Este canal aún no tiene videos.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-borde">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-superficie text-suave">
              <tr>
                <th className="px-3 py-2 font-medium">Publicación</th>
                <th className="px-3 py-2 font-medium">Título</th>
                <th className="px-3 py-2 font-medium">Pilar</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Fuentes</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => (
                <tr key={v.id} className="border-t border-borde">
                  <td className="px-3 py-2 whitespace-nowrap text-suave">
                    {v.fechaPublicacion
                      ? formatearFechaHora(v.fechaPublicacion, canal.zonaHoraria, canal.idioma)
                      : "Sin fecha"}
                  </td>
                  <td className="px-3 py-2">{v.titulo}</td>
                  <td className="px-3 py-2 text-suave">{v.pilar ?? "—"}</td>
                  <td className="px-3 py-2">
                    <EstadoVideoChip estado={v.estado} />
                  </td>
                  <td className="px-3 py-2 text-suave">{v.fuentesOk ? "Verificadas" : "Pendientes"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
