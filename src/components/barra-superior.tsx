"use client";

import Link from "next/link";
import { useSelectedLayoutSegments } from "next/navigation";
import { SelectorCanal } from "./selector-canal";

type Props = {
  panel: string;
  canales: { slug: string; nombre: string }[];
  usuario: { nombre: string; detalle: string };
  salir: () => Promise<void>;
};

export function BarraSuperior({ panel, canales, usuario, salir }: Props) {
  const segmentos = useSelectedLayoutSegments();
  const actual = segmentos[0] === "c" ? (segmentos[1] ?? null) : null;

  return (
    <header className="sticky top-0 z-20 border-b border-borde bg-fondo/90 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span aria-hidden className="h-3 w-3 rounded-full bg-acento" />
          {panel}
        </Link>
        <SelectorCanal canales={canales} actual={actual} />
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="hidden text-suave sm:inline">
            {usuario.nombre} · {usuario.detalle}
          </span>
          <form action={salir}>
            <button type="submit" className="rounded-md border border-borde px-2 py-1.5 hover:border-acento">
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
