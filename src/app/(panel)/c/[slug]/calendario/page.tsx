import Link from "next/link";
import { notFound } from "next/navigation";
import { construirMes, diasProduccion, esMesValido, mesVecino, sumarDias } from "@/lib/dominio/calendario";
import { fechaLocal } from "@/lib/dominio/fechas";
import { prisma } from "@/server/db";
import { listarVideosDeCanal, obtenerCanalPorSlug } from "@/server/acceso";
import { eventosDeCanal } from "@/server/metricas";
import { requireUsuario } from "@/server/sesion";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default async function Calendario({ params, searchParams }: PageProps<"/c/[slug]/calendario">) {
  const { slug } = await params;
  const { mes: mesParam } = await searchParams;
  const usuario = await requireUsuario();
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal) notFound();

  const hoy = fechaLocal(new Date(), canal.zonaHoraria);
  const mes = typeof mesParam === "string" && esMesValido(mesParam) ? mesParam : hoy.slice(0, 7);
  const videos = await listarVideosDeCanal(prisma, usuario, canal.id);
  const diasAntes = diasProduccion(canal.reglas);
  // Margen de una semana a cada lado: la grilla muestra días de los meses vecinos.
  const reuniones = await eventosDeCanal(
    prisma,
    usuario,
    canal.id,
    new Date(`${sumarDias(`${mes}-01`, -7)}T00:00:00Z`),
    new Date(`${sumarDias(`${mesVecino(mes, 1)}-01`, 7)}T00:00:00Z`),
  );
  const semanas = construirMes(mes, videos, canal.zonaHoraria, diasAntes, reuniones);
  const titulo = new Intl.DateTimeFormat(canal.idioma, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${mes}-01T00:00:00Z`),
  );
  const base = `/c/${canal.slug}/calendario`;

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold first-letter:uppercase">{titulo}</h2>
        <div className="flex gap-1 text-sm">
          <Link href={`${base}?mes=${mesVecino(mes, -1)}`} className="rounded-md border border-borde px-2 py-1 hover:border-acento">
            ‹ Anterior
          </Link>
          <Link href={base} className="rounded-md border border-borde px-2 py-1 hover:border-acento">
            Hoy
          </Link>
          <Link href={`${base}?mes=${mesVecino(mes, 1)}`} className="rounded-md border border-borde px-2 py-1 hover:border-acento">
            Siguiente ›
          </Link>
        </div>
        <ul className="ml-auto flex gap-4 text-xs text-suave">
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-acento" /> Publicación
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-acento" /> Producción ({diasAntes} días antes)
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-zinc-600" /> Reunión (Google Calendar)
          </li>
        </ul>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-7 overflow-hidden rounded-lg border border-borde">
          {DIAS.map((d) => (
            <div key={d} className="border-b border-borde bg-superficie px-2 py-1.5 text-xs text-suave">
              {d}
            </div>
          ))}
          {semanas.flat().map((dia) => (
            <div
              key={dia.fecha}
              className={`min-h-28 border-b border-r border-borde p-1.5 text-xs ${dia.delMes ? "" : "bg-fondo/60 opacity-50"}`}
            >
              <div className={`mb-1 ${dia.fecha === hoy ? "font-bold text-acento" : "text-suave"}`}>
                {Number(dia.fecha.slice(8))}
              </div>
              <ul className="space-y-1">
                {dia.eventos.map((e) => (
                  <li
                    key={`${e.tipo}-${e.videoId}`}
                    title={`${{ publicacion: "Publicación", produccion: "Producción", reunion: "Reunión" }[e.tipo]}: ${e.titulo}`}
                    className={`truncate rounded px-1 py-0.5 ${
                      e.tipo === "publicacion"
                        ? "bg-acento font-medium text-fondo"
                        : e.tipo === "produccion"
                          ? "border border-acento text-acento"
                          : "bg-zinc-700 text-zinc-100"
                    }`}
                  >
                    {e.titulo}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs text-suave">Fechas y horas en {canal.zonaHoraria}.</p>
    </section>
  );
}
