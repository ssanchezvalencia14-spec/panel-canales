"use client";

import { useActionState } from "react";
import type { Resultado } from "@/server/acciones/resultado";
import { Aviso } from "./equipo-formularios";

/** Formulario genérico para una server action con aviso de resultado debajo. */
export function FormularioAccion({
  accion,
  boton,
  pendiente: textoPendiente = "Guardando…",
  children,
  className = "space-y-2",
  variante = "primario",
  confirmar,
}: {
  accion: (prev: Resultado, form: FormData) => Promise<Resultado>;
  boton: string;
  pendiente?: string;
  children?: React.ReactNode;
  className?: string;
  variante?: "primario" | "secundario";
  confirmar?: string;
}) {
  const [r, enviar, pendiente] = useActionState(accion, null);
  return (
    <form
      action={enviar}
      className={className}
      onSubmit={(e) => {
        if (confirmar && !confirm(confirmar)) e.preventDefault();
      }}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className={
            variante === "primario"
              ? "rounded-md bg-acento px-3 py-2 text-sm font-semibold text-fondo disabled:opacity-60"
              : "rounded-md border border-borde px-3 py-2 text-sm hover:border-acento disabled:opacity-60"
          }
        >
          {pendiente ? textoPendiente : boton}
        </button>
        <Aviso resultado={r} />
      </div>
    </form>
  );
}

export const claseCampo = "w-full rounded-md border border-borde bg-fondo px-3 py-2 text-sm outline-none focus:border-acento";
