"use client";

import { useActionState } from "react";
import { NOMBRE_ROL, ROLES, type Rol } from "@/lib/dominio/roles";
import type { Resultado } from "@/server/acciones/resultado";

type Accion = (prev: Resultado, form: FormData) => Promise<Resultado>;

export function Aviso({ resultado }: { resultado: Resultado }) {
  if (!resultado) return null;
  return resultado.error ? (
    <p role="alert" className="text-sm text-red-300">
      {resultado.error}
    </p>
  ) : (
    <p role="status" className="text-sm text-emerald-300">
      {resultado.ok}
    </p>
  );
}

const campo = "campo";

export function FormularioAgregarMiembro({ accion }: { accion: Accion }) {
  const [resultado, enviar, pendiente] = useActionState(accion, null);
  return (
    <form action={enviar} className="rounded-lg border border-borde bg-superficie p-4">
      <h3 className="font-semibold">Dar acceso</h3>
      <p className="mt-1 text-sm text-suave">La persona entra con un enlace a este correo. No hay registro libre.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_10rem_auto]">
        <input name="email" type="email" required placeholder="correo@ejemplo.com" aria-label="Correo" className={campo} />
        <input name="nombre" placeholder="Nombre (opcional)" aria-label="Nombre" className={campo} />
        <select name="rol" defaultValue="productor" aria-label="Rol" className={campo}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {NOMBRE_ROL[r]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pendiente}
          className="btn-primario"
        >
          {pendiente ? "Guardando…" : "Agregar"}
        </button>
      </div>
      <div className="mt-2">
        <Aviso resultado={resultado} />
      </div>
    </form>
  );
}

export function ControlesMiembro({
  rol,
  cambiar,
  quitar,
}: {
  rol: Rol;
  cambiar: Accion;
  quitar: (prev: Resultado) => Promise<Resultado>;
}) {
  const [resCambio, enviarCambio, cambiando] = useActionState(cambiar, null);
  const [resQuitar, enviarQuitar, quitando] = useActionState(quitar, null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={enviarCambio} className="flex items-center gap-2">
        <select
          name="rol"
          defaultValue={rol}
          aria-label="Rol"
          className="campo py-1"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          disabled={cambiando}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {NOMBRE_ROL[r]}
            </option>
          ))}
        </select>
      </form>
      <form
        action={enviarQuitar}
        onSubmit={(e) => {
          if (!confirm("¿Quitar el acceso de esta persona al canal?")) e.preventDefault();
        }}
      >
        <button
          type="submit"
          disabled={quitando}
          className="btn-secundario px-3 py-1 text-suave hover:border-red-400 hover:text-red-200"
        >
          Quitar
        </button>
      </form>
      <Aviso resultado={resCambio?.error ? resCambio : resQuitar} />
    </div>
  );
}
