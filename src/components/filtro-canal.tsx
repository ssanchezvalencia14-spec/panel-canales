import Link from "next/link";
import { textoSobre } from "@/lib/dominio/calendario-global";

type Canal = { slug: string; nombre: string; color?: string };

/**
 * Filtro por canal: «Todos» más un botón por canal. Son enlaces normales
 * (`?canal=…`), así el filtro vive en la dirección y se puede compartir.
 */
export function FiltroCanal({ canales, actual, ruta, extra = {} }: { canales: Canal[]; actual: string | null; ruta: string; extra?: Record<string, string> }) {
  if (canales.length < 2) return null;
  const href = (slug: string | null) => {
    const p = new URLSearchParams(extra);
    if (slug) p.set("canal", slug);
    const q = p.toString();
    return q ? `${ruta}?${q}` : ruta;
  };
  const base = "inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition";
  return (
    <nav aria-label="Filtrar por canal" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      <Link
        href={href(null)}
        aria-current={actual === null ? "true" : undefined}
        className={`${base} ${actual === null ? "border-primario bg-primario font-semibold text-sobre-primario" : "border-borde-campo text-suave hover:border-primario hover:text-texto"}`}
      >
        Todos
      </Link>
      {canales.map((c) => {
        const activo = actual === c.slug;
        return (
          <Link
            key={c.slug}
            href={href(c.slug)}
            aria-current={activo ? "true" : undefined}
            style={activo && c.color ? { backgroundColor: c.color, borderColor: c.color, color: textoSobre(c.color) } : undefined}
            className={`${base} ${activo ? "font-semibold" : "border-borde-campo text-suave hover:border-primario hover:text-texto"}`}
          >
            {c.color && !activo && <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />}
            {c.nombre}
          </Link>
        );
      })}
    </nav>
  );
}
