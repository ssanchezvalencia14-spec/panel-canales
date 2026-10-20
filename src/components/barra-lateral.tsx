"use client";

import Link from "next/link";
import { usePathname, useSelectedLayoutSegments } from "next/navigation";
import { useEffect, useRef } from "react";

// Lo que se usa todos los días está arriba y a la vista. La producción de videos
// (tablero, guiones, ejecuciones…) queda recogida en «Producción» por canal.
// En escritorio es una barra lateral; en móvil, un menú desplegable bajo la barra superior.
const SECCIONES_PRODUCCION = [
  { segmento: "tablero", nombre: "Tablero" },
  { segmento: "videos", nombre: "Videos" },
  { segmento: "ejecuciones", nombre: "Ejecuciones" },
  { segmento: "informes", nombre: "Informes" },
  { segmento: "equipo", nombre: "Equipo" },
] as const;

type ItemMenu = { href: string; nombre: string; activo: boolean; sub?: boolean };

function Enlace({ item }: { item: ItemMenu }) {
  return (
    <Link
      href={item.href}
      aria-current={item.activo ? "page" : undefined}
      className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${item.sub ? "pl-6" : ""} ${
        item.activo ? "bg-primario font-semibold text-sobre-primario" : "text-suave hover:bg-superficie hover:text-texto"
      }`}
    >
      {item.nombre}
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

  const principales: ItemMenu[] = [
    { href: "/", nombre: "Inicio", activo: segmentos.length === 0 },
    { href: "/calendario", nombre: "Calendario", activo: raiz === "calendario" || seccion === "calendario" },
    { href: "/estadisticas", nombre: "Estadísticas", activo: raiz === "estadisticas" || seccion === "estadisticas" },
    ...(esSuperadmin ? [{ href: "/canales", nombre: "Canales", activo: raiz === "canales" }] : []),
  ];
  const produccion: ItemMenu[] = slug
    ? SECCIONES_PRODUCCION.map((s) => ({ href: `/c/${slug}/${s.segmento}`, nombre: s.nombre, activo: seccion === s.segmento, sub: true }))
    : [];
  const finales: ItemMenu[] = [
    ...(esSuperadmin ? [{ href: "/auditoria", nombre: "Auditoría", activo: raiz === "auditoria" }] : []),
    { href: "/ayuda", nombre: "Ayuda", activo: raiz === "ayuda" },
  ];
  const actual = [...principales, ...produccion, ...finales].find((i) => i.activo)?.nombre ?? "Menú";

  // El menú móvil se cierra solo al navegar.
  const pathname = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [pathname]);

  return (
    <>
      {/* Móvil: menú desplegable que no empuja el ancho de la página. */}
      <details ref={menu} className="group sticky top-[52px] z-10 border-b border-borde bg-fondo md:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="inline-flex flex-col gap-[3px]">
            <span className="block h-0.5 w-4 rounded bg-current" />
            <span className="block h-0.5 w-4 rounded bg-current" />
            <span className="block h-0.5 w-4 rounded bg-current" />
          </span>
          <span className="sr-only">Abrir menú de secciones · </span>
          <span>{actual}</span>
          <span aria-hidden className="ml-auto text-suave transition-transform group-open:rotate-180">▾</span>
        </summary>
        <nav aria-label="Secciones" className="absolute inset-x-0 top-full max-h-[75vh] overflow-y-auto border-b border-borde bg-fondo px-3 pb-4 shadow-xl shadow-black/40">
          <div className="grid gap-1">
            {principales.map((i) => (
              <Enlace key={i.href} item={i} />
            ))}
          </div>
          {produccion.length > 0 && (
            <>
              <p className="mt-3 px-3 text-xs font-medium tracking-wide text-suave uppercase">Producción de videos</p>
              <div className="mt-1 grid gap-1">
                {produccion.map((i) => (
                  <Enlace key={i.href} item={i} />
                ))}
              </div>
            </>
          )}
          <div className="mt-3 grid gap-1 border-t border-borde pt-3">
            {finales.map((i) => (
              <Enlace key={i.href} item={i} />
            ))}
          </div>
        </nav>
      </details>

      {/* Escritorio: barra lateral fija. */}
      <nav
        aria-label="Secciones"
        className="hidden md:sticky md:top-[52px] md:flex md:h-[calc(100vh-52px)] md:w-60 md:shrink-0 md:flex-col md:gap-1 md:overflow-y-auto md:border-r md:border-borde md:px-4 md:py-4"
      >
        {principales.map((i) => (
          <Enlace key={i.href} item={i} />
        ))}

        {produccion.length > 0 && (
          <details open={enProduccion} className="group mt-2">
            <summary className="flex cursor-pointer list-none items-center rounded-lg px-3 py-2 text-sm text-suave hover:bg-superficie hover:text-texto [&::-webkit-details-marker]:hidden">
              Producción de videos
              <span aria-hidden className="ml-auto inline-block text-xs transition-transform group-open:rotate-90">›</span>
            </summary>
            <div className="mt-1 flex flex-col gap-1">
              {produccion.map((i) => (
                <Enlace key={i.href} item={i} />
              ))}
            </div>
          </details>
        )}

        <div className="mt-auto flex flex-col gap-1 pt-4">
          {finales.map((i) => (
            <Enlace key={i.href} item={i} />
          ))}
        </div>
      </nav>
    </>
  );
}
