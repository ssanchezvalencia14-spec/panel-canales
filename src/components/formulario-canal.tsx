"use client";

import { useActionState, useState } from "react";
import type { Resultado } from "@/server/acciones/resultado";
import { Aviso } from "./equipo-formularios";

type Props = {
  accion: (prev: Resultado, form: FormData) => Promise<Resultado>;
  zonas: string[];
};

const DIAS = [
  ["lun", "Lun"],
  ["mar", "Mar"],
  ["mie", "Mié"],
  ["jue", "Jue"],
  ["vie", "Vie"],
  ["sab", "Sáb"],
  ["dom", "Dom"],
] as const;

const campo = "w-full rounded-md border border-borde bg-fondo px-3 py-2 text-sm outline-none focus:border-acento";
const etiqueta = "block text-sm font-medium";
const ayuda = "mt-1 text-xs text-suave";

export function FormularioCanal({ accion, zonas }: Props) {
  const [resultado, enviar, pendiente] = useActionState(accion, null);
  const [color, setColor] = useState("#d4d4d8");

  return (
    <form
      action={enviar}
      className="max-w-2xl space-y-5 rounded-lg border border-borde bg-superficie p-5"
      style={{ "--acento": color } as React.CSSProperties}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="nombre" className={etiqueta}>Nombre</label>
          <input id="nombre" name="nombre" required maxLength={120} className={`${campo} mt-1`} />
        </div>
        <div>
          <label htmlFor="slug" className={etiqueta}>Identificador (slug)</label>
          <input id="slug" name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="se genera del nombre" className={`${campo} mt-1`} />
          <p className={ayuda}>Minúsculas y guiones. Va en la dirección del canal.</p>
        </div>
        <div>
          <label htmlFor="idioma" className={etiqueta}>Idioma</label>
          <input id="idioma" name="idioma" defaultValue="es" required className={`${campo} mt-1`} />
          <p className={ayuda}>Código como es, en o pt-BR.</p>
        </div>
        <div>
          <label htmlFor="zonaHoraria" className={etiqueta}>Zona horaria</label>
          <input id="zonaHoraria" name="zonaHoraria" list="zonas" required placeholder="America/Bogota" className={`${campo} mt-1`} />
          <datalist id="zonas">
            {zonas.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="horaPublicacion" className={etiqueta}>Hora de publicación</label>
          <input id="horaPublicacion" name="horaPublicacion" type="time" required defaultValue="12:00" className={`${campo} mt-1`} />
        </div>
        <div>
          <label htmlFor="colorAcento" className={etiqueta}>Color de acento</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="colorAcento"
              name="colorAcento"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-borde bg-fondo"
            />
            <span className="font-mono text-sm text-suave">{color}</span>
          </div>
        </div>
      </div>

      <fieldset>
        <legend className={etiqueta}>Días de publicación</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {DIAS.map(([valor, texto]) => (
            <label key={valor} className="flex items-center gap-1.5 rounded-md border border-borde px-2 py-1 text-sm">
              <input type="checkbox" name="diasPublicacion" value={valor} className="accent-[var(--acento)]" />
              {texto}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="pilares" className={etiqueta}>Pilares</label>
        <textarea id="pilares" name="pilares" required rows={3} placeholder={"Un pilar por línea"} className={`${campo} mt-1`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="limiteGastoVideo" className={etiqueta}>Tope de gasto por video (USD)</label>
          <input id="limiteGastoVideo" name="limiteGastoVideo" type="number" min="0" step="0.01" placeholder="Sin tope" className={`${campo} mt-1`} />
        </div>
        <div>
          <label htmlFor="reglas" className={etiqueta}>Reglas (JSON, opcional)</label>
          <textarea
            id="reglas"
            name="reglas"
            rows={3}
            placeholder={'{ "diasProduccionAntes": 3 }'}
            className={`${campo} mt-1 font-mono text-xs`}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-md bg-acento px-4 py-2 text-sm font-semibold text-fondo disabled:opacity-60"
        >
          {pendiente ? "Creando…" : "Crear canal"}
        </button>
        <Aviso resultado={resultado} />
      </div>
    </form>
  );
}
