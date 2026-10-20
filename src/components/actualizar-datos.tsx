"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Resultado } from "@/server/acciones/resultado";

/** Vuelve a leer la página cada minuto mientras la pestaña está a la vista (así el equipo ve los cambios sin recargar). */
function useAutoActualizar(segundos: number) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, segundos * 1000);
    return () => clearInterval(id);
  }, [router, segundos]);
}

export function ActualizarDatos({ accion, actualizadoEn }: { accion: () => Promise<Resultado>; actualizadoEn: string }) {
  useAutoActualizar(60);
  const [resultado, enviar, pendiente] = useActionState(async () => accion(), null as Resultado);

  return (
    <form action={enviar} className="flex flex-wrap items-center gap-3 text-sm">
      <button
        type="submit"
        disabled={pendiente}
        className="btn-secundario px-3 py-1.5"
      >
        <span aria-hidden className={pendiente ? "animate-spin" : ""}>↻</span>
        {pendiente ? "Actualizando…" : "Actualizar ahora"}
      </button>
      <span className="text-xs text-suave">{actualizadoEn}</span>
      {resultado?.ok && <span role="status" className="text-xs text-acento">{resultado.ok}</span>}
      {resultado?.error && (
        <span role="alert" className="text-xs text-red-300">
          {resultado.error}
        </span>
      )}
    </form>
  );
}
