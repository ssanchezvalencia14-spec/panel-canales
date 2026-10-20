"use client";

import Link from "next/link";
import { MarcaInvisual } from "./logo-invisual";

type Props = {
  panel: string;
  usuario: { nombre: string; detalle: string };
  salir: () => Promise<void>;
};

export function BarraSuperior({ panel, usuario, salir }: Props) {
  return (
    <header className="sticky top-0 z-20 bg-azul text-white shadow-[0_1px_0_rgba(255,255,255,0.12)]">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2.5 font-semibold">
          <MarcaInvisual className="h-7 w-auto" titulo="invisual" />
          <span className="hidden sm:inline">{panel}</span>
        </Link>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="hidden text-white/80 sm:inline">
            {usuario.nombre} · {usuario.detalle}
          </span>
          <form action={salir}>
            <button type="submit" className="rounded-full border border-white/40 px-3 py-1.5 hover:bg-white hover:text-azul">
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
