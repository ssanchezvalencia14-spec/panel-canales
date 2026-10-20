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
          className="campo min-w-0 flex-1 rounded-full px-4"
        />
        <button
          type="submit"
          disabled={pendiente}
          className="btn-primario sm:px-5"
        >
          {pendiente ? "Leyendo canal…" : etiqueta}
        </button>
      </div>
      {!slug && (
        <label className="flex items-start gap-2 pt-1 text-sm text-suave">
          <input type="checkbox" name="equipo" value="si" defaultChecked className="mt-0.5 h-4 w-4 accent-[var(--primario)]" />
          <span>Dar acceso al equipo actual (cada persona con el rol que tiene en los demás canales).</span>
        </label>
      )}
      {resultado?.error && (
        <p role="alert" className="text-sm text-red-300">
          {resultado.error}
        </p>
      )}
    </form>
  );
}
