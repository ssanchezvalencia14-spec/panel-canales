"use client";

// Confirmación explícita en pantalla para todo paso que publica: muestra qué
// va a pasar, exige marcar la casilla y recién entonces habilita el botón.
// El servidor vuelve a exigir la confirmación (confirmo = "si").

import { useActionState, useState } from "react";
import type { Resultado } from "@/server/acciones/resultado";
import { Aviso } from "./equipo-formularios";

export function ConfirmarAccion({
  accion,
  titulo,
  resumen,
  textoConfirmacion,
  boton,
  pendiente = "Procesando…",
  children,
  deshabilitado = false,
}: {
  accion: (prev: Resultado, form: FormData) => Promise<Resultado>;
  titulo: string;
  resumen: string[];
  textoConfirmacion: string;
  boton: string;
  pendiente?: string;
  children?: React.ReactNode;
  deshabilitado?: boolean;
}) {
  const [r, enviar, enCurso] = useActionState(accion, null);
  const [acepta, setAcepta] = useState(false);
  return (
    <form action={enviar} className="space-y-3 rounded-md border border-acento/60 bg-fondo p-3">
      <p className="text-sm font-medium">{titulo}</p>
      <ul className="list-disc space-y-0.5 pl-5 text-sm text-suave">
        {resumen.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      {children}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="confirmo"
          value="si"
          checked={acepta}
          onChange={(e) => setAcepta(e.target.checked)}
          disabled={deshabilitado}
          className="mt-0.5 accent-[var(--acento)]"
        />
        <span>{textoConfirmacion}</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!acepta || enCurso || deshabilitado}
          className="btn-primario"
        >
          {enCurso ? pendiente : boton}
        </button>
        <Aviso resultado={r} />
      </div>
    </form>
  );
}

/** Botón «Copiar» para los textos listos de TikTok. */
export function Copiar({ texto }: { texto: string }) {
  const [hecho, setHecho] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setHecho(true);
        setTimeout(() => setHecho(false), 1500);
      }}
      className="btn-secundario px-2.5 py-1 text-xs"
    >
      {hecho ? "Copiado" : "Copiar"}
    </button>
  );
}

/** Una parte de TikTok: textos para copiar, checklist y registro confirmado de la URL. */
export function ParteTiktok({
  parte,
  partes,
  descripcion,
  comentario,
  checklist,
  publicada,
  accion,
  puedeRegistrar,
}: {
  parte: number;
  partes: number;
  descripcion: string;
  comentario: string;
  checklist: string[];
  publicada: string | null;
  accion: (prev: Resultado, form: FormData) => Promise<Resultado>;
  puedeRegistrar: boolean;
}) {
  const [marcados, setMarcados] = useState<boolean[]>(checklist.map(() => false));
  const listo = marcados.every(Boolean);
  return (
    <article className="space-y-3 rounded-md border border-borde bg-fondo p-3">
      <header className="flex items-center gap-3">
        <h4 className="text-sm font-semibold">
          Parte {parte} de {partes}
        </h4>
        {publicada && (
          <a href={publicada} target="_blank" rel="noopener noreferrer" className="truncate text-xs text-emerald-300 underline">
            Publicada: {publicada}
          </a>
        )}
      </header>
      <div>
        <div className="mb-1 flex items-center gap-2 text-xs text-suave">
          Descripción y hashtags <Copiar texto={descripcion} />
        </div>
        <pre className="whitespace-pre-wrap rounded border border-borde p-2 font-sans text-sm">{descripcion}</pre>
      </div>
      {comentario && (
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs text-suave">
            Comentario fijado <Copiar texto={comentario} />
          </div>
          <pre className="whitespace-pre-wrap rounded border border-borde p-2 font-sans text-sm">{comentario}</pre>
        </div>
      )}
      {!publicada && puedeRegistrar && (
        <>
          <ul className="space-y-1">
            {checklist.map((it, i) => (
              <li key={it}>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={marcados[i]}
                    onChange={(e) => setMarcados((m) => m.map((x, j) => (j === i ? e.target.checked : x)))}
                    className="mt-0.5 accent-[var(--acento)]"
                  />
                  {it}
                </label>
              </li>
            ))}
          </ul>
          <ConfirmarAccion
            accion={accion}
            titulo="Registrar la URL publicada en TikTok"
            resumen={[`Parte ${parte} de ${partes}`, "Queda en el registro de actividad y se avisa al equipo por correo."]}
            textoConfirmacion="Confirmo que publiqué esta parte en TikTok siguiendo el checklist."
            boton="Registrar publicación"
            deshabilitado={!listo}
          >
            <input name="enlace" type="url" required placeholder="https://www.tiktok.com/@cuenta/video/…" aria-label={`Enlace de la parte ${parte} en TikTok`} className="w-full rounded-md border border-borde bg-superficie px-3 py-2 text-sm" />
            {!listo && <p className="text-xs text-amber-300">Completa el checklist para habilitar el registro.</p>}
          </ConfirmarAccion>
        </>
      )}
    </article>
  );
}
