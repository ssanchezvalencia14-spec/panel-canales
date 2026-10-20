import Link from "next/link";
import { notFound } from "next/navigation";
import { ESTADOS_VIDEO, NOMBRE_ESTADO } from "@/lib/dominio/estados";
import { fechaLocal } from "@/lib/dominio/fechas";
import { prisma } from "@/server/db";
import { listarVideosDeCanal, obtenerCanalPorSlug } from "@/server/acceso";
import { requireUsuario } from "@/server/sesion";

export default async function Tablero({ params }: PageProps<"/c/[slug]/tablero">) {
  const { slug } = await params;
  const usuario = await requireUsuario();
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal) notFound();
  const videos = await listarVideosDeCanal(prisma, usuario, canal.id);

  return (
    <section>
      <p className="text-sm text-suave">Videos por estado. Abre un video para cambiar su estado.</p>
      {/* Móvil: columnas apiladas. Escritorio: columnas en fila con desplazamiento propio. */}
      <div className="mt-4 flex flex-col gap-3 md:flex-row md:overflow-x-auto md:pb-4">
        {ESTADOS_VIDEO.map((estado) => {
          const columna = videos.filter((v) => v.estado === estado);
          return (
            <div key={estado} className="rounded-2xl border border-borde bg-superficie md:w-64 md:shrink-0">
              <h3 className="flex items-center justify-between border-b border-borde px-3 py-2.5 text-sm font-semibold">
                {NOMBRE_ESTADO[estado]}
                <span className="rounded-full bg-fondo px-2 py-0.5 text-xs font-medium text-suave tabular-nums">{columna.length}</span>
              </h3>
              <ul className="space-y-2 p-2">
                {columna.map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`/c/${canal.slug}/videos/${v.id}`}
                      className="block rounded-xl border border-borde bg-fondo p-2.5 text-sm transition hover:border-acento"
                    >
                      <p className="font-medium">{v.titulo}</p>
                      <p className="mt-1 text-xs text-suave">
                        {v.fechaPublicacion ? fechaLocal(v.fechaPublicacion, canal.zonaHoraria) : "Sin fecha"}
                        {v.pilar ? ` · ${v.pilar}` : ""}
                      </p>
                    </Link>
                  </li>
                ))}
                {columna.length === 0 && <li className="px-1 py-2 text-xs text-suave">Vacío</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
