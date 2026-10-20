"use client";

import { useActionState } from "react";
import type { Resultado } from "@/server/acciones/resultado";

type Props = {
  accion: (prev: Resultado, form: FormData) => Promise<Resultado>;
  /** Si se pasa, el enlace se asocia a ese canal que ya existe en el panel en vez de crear uno nuevo. */
  slug?: string;
  etiqueta?: string;
  compacto?: boolean;
};

export function FormularioEnlace({ accion, slug, etiqueta = "Agregar canal", compacto = false }: Props) {
  const [resultado, enviar, pendiente] = useActionState(accion, null);
  const id = `enlace-${slug ?? "nuevo"}`;
  return (
    <form action={enviar} className={compacto ? "space-y-1" : "space-y-2"}>
      {slug && <input type="hidden" name="slug" value={slug} />}
      <label htmlFor={id} className={compacto ? "sr-only" : "block text-sm font-medium"}>
        Enlace del canal de YouTube
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={id}
          name="enlace"
          required
          inputMode="url"
          autoComplete="off"
          placeholder="youtube.com/@micanal"
          className="min-w-0 flex-1 rounded-full border border-borde bg-fondo px-4 py-2.5 text-sm outline-none placeholder:text-suave/70 focus:border-acento"
        />
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-full bg-acento px-5 py-2.5 text-sm font-semibold text-fondo hover:brightness-95 disabled:opacity-60"
        >
          {pendiente ? "Leyendo canal…" : etiqueta}
        </button>
      </div>
      {resultado?.error && (
        <p role="alert" className="text-sm text-red-300">
          {resultado.error}
        </p>
      )}
    </form>
  );
}
