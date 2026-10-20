"use client";

import Link from "next/link";
import { useSelectedLayoutSegments } from "next/navigation";

// Lo que se usa todos los días está arriba y a la vista. La producción de videos
// (tablero, guiones, ejecuciones…) queda recogida en «Producción» por canal.
const SECCIONES_PRODUCCION = [
  { segmento: "tablero", nombre: "Tablero" },
  { segmento: "videos", nombre: "Videos" },
  { segmento: "ejecuciones", nombre: "Ejecuciones" },
  { segmento: "informes", nombre: "Informes" },
  { segmento: "equipo", nombre: "Equipo" },
] as const;

function Enlace({ href, activo, children, sub = false }: { href: string; activo: boolean; children: React.ReactNode; sub?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm ${sub ? "pl-6" : ""} ${
        activo ? "bg-acento font-semibold text-fondo" : "text-suave hover:bg-superficie hover:text-texto"
      }`}
    >
      {children}
    </Link>
  );
}

export function BarraLateral({ esSuperadmin, canales }: { esSuperadmin: boolean; canales: { slug: string }[] }) {
  const segmentos = useSelectedLayoutSegments();
  const raiz = segmentos[0];
  const enCanal = raiz === "c" ? segmentos[1] : null;
  const seccion = enCanal ? (segmentos[2] ?? "calendario") : null;
  // Fuera de un canal, la producción apunta al primer canal visible.
  const slug = enCanal ?? canales[0]?.slug ?? null;
  const enProduccion = Boolean(enCanal && SECCIONES_PRODUCCION.some((s) => s.segmento === seccion));

  return (
    <nav
      aria-label="Secciones"
      className="flex gap-1 overflow-x-auto border-b border-borde px-4 py-2 md:sticky md:top-[52px] md:h-[calc(100vh-52px)] md:w-60 md:shrink-0 md:flex-col md:overflow-y-auto md:overflow-x-visible md:border-r md:border-b-0 md:py-4"
    >
      <Enlace href="/" activo={segmentos.length === 0}>
        Inicio
      </Enlace>
      <Enlace href="/calendario" activo={raiz === "calendario" || seccion === "calendario"}>
        Calendario
      </Enlace>
      <Enlace href="/estadisticas" activo={raiz === "estadisticas" || seccion === "estadisticas"}>
        Estadísticas
      </Enlace>
      {esSuperadmin && (
        <Enlace href="/canales" activo={raiz === "canales"}>
          Canales
        </Enlace>
      )}

      {slug && (
        <details open={enProduccion} className="group md:mt-2">
          <summary className="cursor-pointer list-none rounded-lg px-3 py-2 text-sm text-suave hover:bg-superficie hover:text-texto">
            Producción de videos <span aria-hidden className="ml-1 text-xs group-open:rotate-90 inline-block">›</span>
          </summary>
          <div className="flex gap-1 md:flex-col">
            {SECCIONES_PRODUCCION.map((s) => (
              <Enlace key={s.segmento} sub href={`/c/${slug}/${s.segmento}`} activo={seccion === s.segmento}>
                {s.nombre}
              </Enlace>
            ))}
          </div>
        </details>
      )}

      <div className="md:mt-auto md:pt-4">
        {esSuperadmin && (
          <Enlace href="/auditoria" activo={raiz === "auditoria"}>
            Auditoría
          </Enlace>
        )}
        <Enlace href="/ayuda" activo={raiz === "ayuda"}>
          Ayuda
        </Enlace>
      </div>
    </nav>
  );
}
