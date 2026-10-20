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

function Chip({ e, envolver = false }: { e: EventoGlobal; envolver?: boolean }) {
  const titulo = `${e.canalNombre} · ${NOMBRE_TIPO[e.tipo]}: ${e.titulo}`;
  const comun = `block rounded-md px-1.5 py-0.5 text-xs leading-snug ${envolver ? "px-2 py-1" : "truncate"}`;
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
        className={`${comun} border bg-fondo text-texto hover:bg-superficie-alta`}
        style={{ borderColor: e.color }}
      >
        <span aria-hidden style={{ color: e.color }}>▶ </span>
        {contenido}
      </a>
    );
  }
  if (e.tipo === "produccion") {
    return (
      <span title={titulo} className={`${comun} border border-dashed text-texto`} style={{ borderColor: e.color }}>
        {contenido}
      </span>
    );
  }
  return (
    <span title={titulo} className={`${comun} bg-white/15 text-texto`}>
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
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">Calendario</h1>
        <p className="mt-1 text-sm text-suave">Publicaciones y producción de todos los canales.</p>
      </div>

      <FiltroCanal canales={cal.filtro} actual={slug} ruta="/calendario" extra={{ mes }} />

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold first-letter:uppercase">{titulo}</h2>
        <div className="flex gap-1.5">
          <Link href={href(mesVecino(mes, -1))} className="btn-secundario px-3 py-1.5" aria-label="Mes anterior">
            <span aria-hidden>‹</span> <span className="hidden sm:inline">Anterior</span>
          </Link>
          <Link href={hoyHref} className="btn-secundario px-3 py-1.5">
            Hoy
          </Link>
          <Link href={href(mesVecino(mes, 1))} className="btn-secundario px-3 py-1.5" aria-label="Mes siguiente">
            <span className="hidden sm:inline">Siguiente</span> <span aria-hidden>›</span>
          </Link>
        </div>
        <ul aria-label="Leyenda" className="flex w-full flex-wrap gap-x-4 gap-y-1.5 text-xs text-suave lg:ml-auto lg:w-auto">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-5 rounded bg-texto" /> Publicación
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-5 rounded border border-dashed border-texto" /> Producción
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-flex h-3 w-5 items-center justify-center rounded border border-texto text-[8px] leading-none">▶</span> Ya publicado en YouTube
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-5 rounded bg-white/15" /> Reunión
          </li>
          <li className="text-suave">El color indica el canal.</li>
        </ul>
      </div>

      {/* Móvil: agenda con los días que tienen algo. */}
      <ol className="space-y-3 md:hidden">
        {cal.semanas
          .flat()
          .filter((dia) => dia.delMes && dia.eventos.length > 0)
          .map((dia) => (
            <li key={dia.fecha} className="rounded-2xl border border-borde bg-superficie p-3">
              <p className={`text-sm font-semibold first-letter:uppercase ${dia.fecha === cal.hoy ? "text-primario" : ""}`}>
                {new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${dia.fecha}T00:00:00Z`))}
                {dia.fecha === cal.hoy && <span className="ml-2 rounded-full bg-primario px-2 py-0.5 text-xs text-sobre-primario">Hoy</span>}
              </p>
              <ul className="mt-2 space-y-1.5">
                {dia.eventos.map((e) => (
                  <li key={e.clave}>
                    <p aria-hidden className="mb-0.5 flex items-center gap-1.5 text-xs text-suave">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} />
                      {e.canalNombre}
                    </p>
                    <Chip e={e} envolver />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        {cal.semanas.flat().every((dia) => !dia.delMes || dia.eventos.length === 0) && (
          <li className="rounded-2xl border border-dashed border-borde-campo p-6 text-center text-sm text-suave">Nada programado este mes.</li>
        )}
      </ol>

      {/* Escritorio: cuadrícula del mes. */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 overflow-hidden rounded-2xl border border-borde">
          {DIAS.map((d) => (
            <div key={d} className="border-b border-borde bg-superficie px-2 py-2 text-xs font-medium tracking-wide text-suave uppercase">
              {d}
            </div>
          ))}
          {cal.semanas.flat().map((dia) => (
            <div key={dia.fecha} className={`min-h-28 min-w-0 border-r border-b border-borde p-1.5 text-xs ${dia.delMes ? "" : "bg-black/20"}`}>
              <div
                className={`mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 ${dia.fecha === cal.hoy ? "bg-primario font-bold text-sobre-primario" : dia.delMes ? "text-texto" : "text-suave/70"}`}
                aria-current={dia.fecha === cal.hoy ? "date" : undefined}
              >
                {Number(dia.fecha.slice(8))}
              </div>
              <ul className="space-y-1">
                {dia.eventos.map((e) => (
                  <li key={e.clave}>
                    <Chip e={e} envolver />
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
