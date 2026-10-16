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
      <p className="text-sm text-suave">Videos por estado. Mover videos entre columnas llega con el tablero interactivo.</p>
      <div className="mt-4 flex gap-3 overflow-x-auto pb-4">
        {ESTADOS_VIDEO.map((estado) => {
          const columna = videos.filter((v) => v.estado === estado);
          return (
            <div key={estado} className="w-60 shrink-0 rounded-lg border border-borde bg-superficie">
              <h3 className="flex items-center justify-between border-b border-borde px-3 py-2 text-sm font-medium">
                {NOMBRE_ESTADO[estado]}
                <span className="text-suave">{columna.length}</span>
              </h3>
              <ul className="space-y-2 p-2">
                {columna.map((v) => (
                  <li key={v.id} className="rounded-md border border-borde bg-fondo p-2 text-sm">
                    <p className="font-medium">{v.titulo}</p>
                    <p className="mt-1 text-xs text-suave">
                      {v.fechaPublicacion ? fechaLocal(v.fechaPublicacion, canal.zonaHoraria) : "Sin fecha"}
                      {v.pilar ? ` · ${v.pilar}` : ""}
                    </p>
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
