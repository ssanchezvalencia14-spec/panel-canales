"use client";

import { useActionState } from "react";
import { NOMBRE_PLATAFORMA, PLATAFORMAS } from "@/lib/dominio/plataformas";
import type { Resultado } from "@/server/acciones/resultado";
import type { ResultadoCsv } from "@/server/acciones/estadisticas";
import { Aviso } from "./equipo-formularios";

type Accion = (prev: Resultado, form: FormData) => Promise<Resultado>;
const campo = "rounded-md border border-borde bg-fondo px-3 py-2 text-sm outline-none focus:border-acento";
const boton = "rounded-md bg-acento px-3 py-2 text-sm font-semibold text-fondo disabled:opacity-60";

export function FormularioPublicacion({ accion }: { accion: Accion }) {
  const [r, enviar, pendiente] = useActionState(accion, null);
  return (
    <form action={enviar} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_11rem_10rem_auto]">
        <input name="enlace" required placeholder="https://www.youtube.com/watch?v=…" aria-label="Enlace del video publicado" className={campo} />
        <select name="plataforma" aria-label="Plataforma" className={campo} defaultValue="">
          <option value="">Detectar del enlace</option>
          {PLATAFORMAS.map((p) => (
            <option key={p} value={p}>
              {NOMBRE_PLATAFORMA[p]}
            </option>
          ))}
        </select>
        <input name="publicada" type="date" aria-label="Fecha en que se publicó" className={campo} />
        <button type="submit" disabled={pendiente} className={boton}>
          {pendiente ? "Guardando…" : "Registrar"}
        </button>
      </div>
      <Aviso resultado={r} />
    </form>
  );
}

const METRICAS = [
  ["vistas", "Vistas", "1"],
  ["retencion", "Retención %", "0.1"],
  ["ctr", "CTR %", "0.1"],
  ["likes", "Likes", "1"],
  ["comentarios", "Comentarios", "1"],
  ["compartidos", "Compartidos", "1"],
  ["suscriptores", "Suscriptores", "1"],
] as const;

export function FormularioMetricas({ accion, hoy }: { accion: Accion; hoy: string }) {
  const [r, enviar, pendiente] = useActionState(accion, null);
  return (
    <form action={enviar} className="space-y-2">
      <p className="text-xs text-suave">Totales acumulados a la fecha indicada (como los muestra la plataforma). Deja vacío lo que no tengas.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-xs text-suave">
          Fecha
          <input name="fecha" aria-label="Fecha" type="date" required defaultValue={hoy} className={`${campo} mt-1 w-full`} />
        </label>
        {METRICAS.map(([n, etiqueta, paso]) => (
          <label key={n} className="text-xs text-suave">
            {etiqueta}
            <input name={n} aria-label={etiqueta} type="number" min="0" max={n === "retencion" || n === "ctr" ? 100 : undefined} step={paso} className={`${campo} mt-1 w-full`} />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pendiente} className={boton}>
          {pendiente ? "Guardando…" : "Guardar métricas"}
        </button>
        <Aviso resultado={r} />
      </div>
    </form>
  );
}

export function BotonAccion({
  accion,
  texto,
  pendienteTexto,
  confirmar,
  variante = "secundario",
}: {
  accion: (prev: Resultado) => Promise<Resultado>;
  texto: string;
  pendienteTexto: string;
  confirmar?: string;
  variante?: "primario" | "secundario";
}) {
  const [r, enviar, pendiente] = useActionState(accion, null);
  return (
    <form
      action={enviar}
      onSubmit={(e) => {
        if (confirmar && !confirm(confirmar)) e.preventDefault();
      }}
      className="space-y-2"
    >
      <button
        type="submit"
        disabled={pendiente}
        className={variante === "primario" ? boton : "rounded-md border border-borde px-3 py-2 text-sm hover:border-acento disabled:opacity-60"}
      >
        {pendiente ? pendienteTexto : texto}
      </button>
      <Aviso resultado={r} />
    </form>
  );
}

export function FormularioCalendario({ accion, actual }: { accion: Accion; actual: string }) {
  const [r, enviar, pendiente] = useActionState(accion, null);
  return (
    <form action={enviar} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input name="calendarioId" defaultValue={actual} aria-label="Id del calendario" className={`${campo} min-w-64 flex-1`} />
        <button type="submit" disabled={pendiente} className="rounded-md border border-borde px-3 py-2 text-sm hover:border-acento">
          Guardar
        </button>
      </div>
      <Aviso resultado={r} />
    </form>
  );
}

export function FormularioCsv({ accion, hoy }: { accion: (p: ResultadoCsv, f: FormData) => Promise<ResultadoCsv>; hoy: string }) {
  const [r, enviar, pendiente] = useActionState(accion, null);
  return (
    <form action={enviar} className="space-y-4 rounded-lg border border-borde bg-superficie p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          Archivo CSV
          <input name="archivo" type="file" accept=".csv,text/csv,text/plain" required className="mt-1 block w-full text-sm" />
        </label>
        <label className="text-sm">
          Plataforma
          <select name="plataforma" defaultValue="tiktok" className={`${campo} mt-1 w-full`}>
            {PLATAFORMAS.map((p) => (
              <option key={p} value={p}>
                {NOMBRE_PLATAFORMA[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Fecha de los datos
          <input name="fecha" type="date" defaultValue={hoy} className={`${campo} mt-1 w-full`} />
          <span className="mt-1 block text-xs text-suave">Se usa si el archivo no trae columna de fecha.</span>
        </label>
      </div>
      <button type="submit" disabled={pendiente} className={boton}>
        {pendiente ? "Importando…" : "Importar"}
      </button>
      <Aviso resultado={r} />
      {r?.detalle && (r.detalle.sinEmparejar.length > 0 || r.detalle.avisos.length > 0) && (
        <div className="space-y-2 text-sm">
          {r.detalle.sinEmparejar.length > 0 && (
            <div>
              <p className="text-suave">Sin emparejar (registra su enlace en la ficha del video y vuelve a importar):</p>
              <ul className="ml-5 list-disc">
                {r.detalle.sinEmparejar.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {r.detalle.avisos.length > 0 && (
            <ul className="ml-5 list-disc text-amber-300">
              {r.detalle.avisos.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
