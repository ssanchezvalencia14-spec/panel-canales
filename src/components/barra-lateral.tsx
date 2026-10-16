"use client";

import Link from "next/link";
import { useSelectedLayoutSegments } from "next/navigation";

const SECCIONES_CANAL = [
  { segmento: "calendario", nombre: "Calendario" },
  { segmento: "tablero", nombre: "Tablero" },
  { segmento: "videos", nombre: "Videos" },
  { segmento: "estadisticas", nombre: "Estadísticas" },
  { segmento: "ejecuciones", nombre: "Ejecuciones" },
  { segmento: "informes", nombre: "Informes" },
  { segmento: "equipo", nombre: "Equipo" },
] as const;

function Enlace({ href, activo, children }: { href: string; activo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={`block whitespace-nowrap rounded-md px-3 py-2 text-sm ${
        activo ? "bg-superficie font-medium text-texto" : "text-suave hover:bg-superficie hover:text-texto"
      }`}
    >
      {activo && <span aria-hidden className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-acento align-middle" />}
      {children}
    </Link>
  );
}

export function BarraLateral({ esSuperadmin, canales }: { esSuperadmin: boolean; canales: { slug: string }[] }) {
  const segmentos = useSelectedLayoutSegments();
  const enCanal = segmentos[0] === "c" ? segmentos[1] : null;
  const crudo = enCanal ? (segmentos[2] ?? "calendario") : null;
  // Integraciones cuelga de Estadísticas.
  const seccion = crudo === "integraciones" ? "estadisticas" : crudo;
  // Fuera de un canal, las secciones apuntan al primer canal visible.
  const slug = enCanal ?? canales[0]?.slug ?? null;

  return (
    <nav
      aria-label="Secciones"
      className="flex gap-1 overflow-x-auto border-b border-borde px-4 py-2 md:sticky md:top-[57px] md:h-[calc(100vh-57px)] md:w-56 md:shrink-0 md:flex-col md:overflow-visible md:border-r md:border-b-0 md:py-4"
    >
      <Enlace href="/" activo={segmentos.length === 0}>
        Red
      </Enlace>
      {slug &&
        SECCIONES_CANAL.map((s) => (
          <Enlace key={s.segmento} href={`/c/${slug}/${s.segmento}`} activo={seccion === s.segmento}>
            {s.nombre}
          </Enlace>
        ))}
      {esSuperadmin && (
        <>
          <hr className="hidden border-borde md:my-2 md:block" />
          <Enlace href="/canales/nuevo" activo={segmentos[0] === "canales"}>
            + Nuevo canal
          </Enlace>
        </>
      )}
    </nav>
  );
}
