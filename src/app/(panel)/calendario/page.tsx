import Link from "next/link";
import { FiltroCanal } from "@/components/filtro-canal";
import { esMesValido, mesVecino } from "@/lib/dominio/calendario";
import { textoSobre, type EventoGlobal } from "@/lib/dominio/calendario-global";
import { fechaLocal } from "@/lib/dominio/fechas";
import { prisma } from "@/server/db";
import { listarCanales } from "@/server/acceso";
import { requireUsuario } from "@/server/sesion";
import { calendarioGlobal } from "@/server/youtube-publico";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const NOMBRE_TIPO = { publicacion: "Publicación", publicado: "Publicado en YouTube", produccion: "Producción", reunion: "Reunión" } as const;

function Chip({ e }: { e: EventoGlobal }) {
  const titulo = `${e.canalNombre} · ${NOMBRE_TIPO[e.tipo]}: ${e.titulo}`;
  const comun = "block truncate rounded-md px-1.5 py-0.5 text-[11px] leading-tight";
  const contenido = (
    <>
      <span className="sr-only">{e.canalNombre}: </span>
      {e.titulo}
    </>
  );
  if (e.tipo === "publicacion") {
    return (
      <span title={titulo} className={`${comun} font-semibold`} style={{ backgroundColor: e.color, color: textoSobre(e.color) }}>
        {contenido}
      </span>
    );
  }
  if (e.tipo === "publicado") {
    return (
      <a
        href={e.url}
        target="_blank"
        rel="noopener noreferrer"
        title={titulo}
        className={`${comun} border hover:brightness-125`}
        style={{ borderColor: e.color, color: e.color, backgroundColor: `${e.color}26` }}
      >
        <span aria-hidden>▶ </span>
        {contenido}
      </a>
    );
  }
  if (e.tipo === "produccion") {
    return (
      <span title={titulo} className={`${comun} border border-dashed`} style={{ borderColor: e.color, color: e.color }}>
        {contenido}
      </span>
    );
  }
  return (
    <span title={titulo} className={`${comun} bg-white/15 text-white`}>
      {contenido}
    </span>
  );
}

export default async function CalendarioGlobal({ searchParams }: PageProps<"/calendario">) {
  const { mes: mesParam, canal: canalParam } = await searchParams;
  const usuario = await requireUsuario();
  const visibles = await listarCanales(prisma, usuario);
  const slug = typeof canalParam === "string" && visibles.some((c) => c.slug === canalParam) ? canalParam : null;
  const hoyBogota = fechaLocal(new Date(), "America/Bogota");
  const mes = typeof mesParam === "string" && esMesValido(mesParam) ? mesParam : hoyBogota.slice(0, 7);
  const cal = await calendarioGlobal(prisma, usuario, mes, { slug: slug ?? undefined });

  const titulo = new Intl.DateTimeFormat("es", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${mes}-01T00:00:00Z`));
  const href = (m: string) => {
    const p = new URLSearchParams({ mes: m });
    if (slug) p.set("canal", slug);
    return `/calendario?${p}`;
  };
  const hoyHref = slug ? `/calendario?canal=${encodeURIComponent(slug)}` : "/calendario";

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Calendario</h1>
        <p className="text-sm text-suave">Publicaciones y producción de todos los canales.</p>
      </div>

      <FiltroCanal canales={cal.filtro} actual={slug} ruta="/calendario" extra={{ mes }} />

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold first-letter:uppercase">{titulo}</h2>
        <div className="flex gap-1 text-sm">
          <Link href={href(mesVecino(mes, -1))} className="rounded-full border border-borde px-3 py-1 hover:border-acento">
            ‹ Anterior
          </Link>
          <Link href={hoyHref} className="rounded-full border border-borde px-3 py-1 hover:border-acento">
            Hoy
          </Link>
          <Link href={href(mesVecino(mes, 1))} className="rounded-full border border-borde px-3 py-1 hover:border-acento">
            Siguiente ›
          </Link>
        </div>
        <ul className="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-suave">
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-acento" /> Publicación
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-acento" /> Producción
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-acento bg-acento/20" /> Ya publicado en YouTube
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-white/30" /> Reunión
          </li>
        </ul>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-7 overflow-hidden rounded-xl border border-borde">
          {DIAS.map((d) => (
            <div key={d} className="border-b border-borde bg-superficie px-2 py-1.5 text-xs font-medium text-suave">
              {d}
            </div>
          ))}
          {cal.semanas.flat().map((dia) => (
            <div key={dia.fecha} className={`min-h-28 border-r border-b border-borde p-1.5 text-xs ${dia.delMes ? "" : "bg-fondo/70 opacity-50"}`}>
              <div className={`mb-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 ${dia.fecha === cal.hoy ? "bg-acento font-bold text-fondo" : "text-suave"}`}>
                {Number(dia.fecha.slice(8))}
              </div>
              <ul className="space-y-1">
                {dia.eventos.map((e) => (
                  <li key={e.clave}>
                    <Chip e={e} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-suave">
        {cal.filtro.length === 0
          ? "Todavía no hay canales. Agrega el primero desde «Canales»."
          : `Fechas y horas en ${cal.zonas.join(", ") || "UTC"}.`}
      </p>
    </section>
  );
}
