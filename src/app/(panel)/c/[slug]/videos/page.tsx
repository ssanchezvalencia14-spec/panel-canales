import Link from "next/link";
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
        <div className="rounded-xl border border-borde bg-superficie p-3">
          <dt className="text-xs text-suave">Publicación</dt>
          <dd className="mt-1">
            {dias} · {canal.horaPublicacion}
          </dd>
        </div>
        <div className="rounded-xl border border-borde bg-superficie p-3">
          <dt className="text-xs text-suave">Zona horaria e idioma</dt>
          <dd className="mt-1">
            {canal.zonaHoraria} · {canal.idioma}
          </dd>
        </div>
        <div className="rounded-xl border border-borde bg-superficie p-3">
          <dt className="text-xs text-suave">Pilares</dt>
          <dd className="mt-1">{pilares.join(" · ") || "Sin definir"}</dd>
        </div>
      </dl>

      <h2 className="mt-8 text-lg font-semibold">Videos ({videos.length})</h2>
      {videos.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-borde-campo p-6 text-center text-sm text-suave">
          Este canal aún no tiene videos.
        </p>
      ) : (
        <>
        {/* Móvil: lista de tarjetas. */}
        <ul className="mt-3 divide-y divide-borde overflow-hidden rounded-2xl border border-borde md:hidden">
          {videos.map((v) => (
            <li key={v.id}>
              <Link href={`/c/${canal.slug}/videos/${v.id}`} className="block px-4 py-3 hover:bg-superficie">
                <p className="font-medium">{v.titulo}</p>
                <p className="mt-1 text-xs text-suave">
                  {v.fechaPublicacion ? formatearFechaHora(v.fechaPublicacion, canal.zonaHoraria, canal.idioma) : "Sin fecha"}
                  {v.pilar ? ` · ${v.pilar}` : ""}
                </p>
                <p className="mt-2 flex items-center gap-2 text-xs text-suave">
                  <EstadoVideoChip estado={v.estado} />
                  Fuentes {v.fuentesOk ? "verificadas" : "pendientes"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-3 hidden overflow-x-auto rounded-2xl border border-borde md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-superficie text-xs text-suave">
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
                  <td className="px-3 py-2">
                    <Link href={`/c/${canal.slug}/videos/${v.id}`} className="font-medium hover:underline">
                      {v.titulo}
                    </Link>
                  </td>
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
        </>
      )}
    </section>
  );
}
