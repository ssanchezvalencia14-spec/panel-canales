import Link from "next/link";
import { ESTADOS_VIDEO, NOMBRE_ESTADO } from "@/lib/dominio/estados";
import { colorSeguro } from "@/lib/dominio/canal-config";
import { formatearFechaHora } from "@/lib/dominio/fechas";
import { acentoPanel } from "@/lib/panel";
import { prisma } from "@/server/db";
import { resumenRed } from "@/server/acceso";
import { requireUsuario } from "@/server/sesion";
import { alertasAbiertasPorCanal } from "@/server/automatizaciones";

export default async function VistaRed({ searchParams }: PageProps<"/">) {
  const usuario = await requireUsuario();
  const resumen = await resumenRed(prisma, usuario);
  const alertas = await alertasAbiertasPorCanal(prisma, resumen.map((r) => r.canal.id));
  const { aviso } = await searchParams;

  return (
    <section>
      {aviso === "sin-acceso" && (
        <p role="alert" className="mb-4 rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          No tienes acceso a esa sección.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Red</h1>
        {usuario.esSuperadmin && (
          <Link
            href="/canales/nuevo"
            className="ml-auto rounded-md bg-acento px-3 py-1.5 text-sm font-semibold text-fondo hover:opacity-90"
          >
            + Nuevo canal
          </Link>
        )}
      </div>
      <p className="mt-1 text-sm text-suave">
        {usuario.esSuperadmin ? "Todos los canales de la red." : "Los canales en los que participas."}
      </p>

      {resumen.length === 0 ? (
        <p className="mt-8 rounded-lg border border-borde bg-superficie p-6 text-sm text-suave">
          Todavía no tienes canales asignados. Pide a un admin que te agregue a uno.
        </p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {resumen.map(({ canal, total, porEstado, proxima }) => (
            <li key={canal.id}>
              <Link
                href={`/c/${canal.slug}/calendario`}
                style={{ "--acento": colorSeguro(canal.colorAcento, acentoPanel()) } as React.CSSProperties}
                className="block rounded-xl border border-borde bg-superficie p-5 transition hover:border-acento"
              >
                <div className="flex items-center gap-2">
                  <span aria-hidden className="h-3 w-3 rounded-full bg-acento" />
                  <h2 className="font-semibold">{canal.nombre}</h2>
                  <span className="ml-auto text-sm text-suave">{total} videos</span>
                  {(alertas.get(canal.id)?.total ?? 0) > 0 && (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${alertas.get(canal.id)!.graves ? "border-red-800 text-red-300" : "border-amber-800 text-amber-300"}`}
                    >
                      {alertas.get(canal.id)!.total} alerta(s)
                    </span>
                  )}
                </div>
                <dl className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                  {ESTADOS_VIDEO.map((e) => (
                    <div key={e} className="rounded-md bg-fondo px-1 py-2">
                      <dt className="truncate text-suave">{NOMBRE_ESTADO[e]}</dt>
                      <dd className="mt-0.5 text-base font-semibold">{porEstado[e]}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 text-sm text-suave">
                  {proxima ? (
                    <>
                      Próxima publicación:{" "}
                      <span className="text-texto">
                        {formatearFechaHora(proxima.fechaPublicacion, canal.zonaHoraria, canal.idioma)}
                      </span>
                      {" · "}
                      {proxima.titulo}
                    </>
                  ) : (
                    "Sin publicaciones próximas."
                  )}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
