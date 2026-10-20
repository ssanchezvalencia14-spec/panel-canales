import Link from "next/link";
import { AvatarCanal } from "@/components/avatar-canal";
import { ESTADOS_VIDEO, NOMBRE_ESTADO } from "@/lib/dominio/estados";
import { colorSeguro } from "@/lib/dominio/canal-config";
import { formatearFechaHora } from "@/lib/dominio/fechas";
import { acentoPanel } from "@/lib/panel";
import { prisma } from "@/server/db";
import { resumenRed } from "@/server/acceso";
import { requireUsuario } from "@/server/sesion";
import { alertasAbiertasPorCanal } from "@/server/automatizaciones";
import { compacto, conSigno } from "@/lib/formato";
import { estadisticasGlobales } from "@/server/youtube-publico";

function Variacion({ valor }: { valor: number | null }) {
  if (valor === null) return null;
  const tono = valor > 0 ? "bg-emerald-400/15 text-emerald-300" : valor < 0 ? "bg-red-400/15 text-red-300" : "bg-white/10 text-suave";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${tono}`}>
      {conSigno(valor)} <span className="font-normal">en 28 d</span>
    </span>
  );
}

export default async function VistaRed({ searchParams }: PageProps<"/">) {
  const usuario = await requireUsuario();
  const resumen = await resumenRed(prisma, usuario);
  const alertas = await alertasAbiertasPorCanal(prisma, resumen.map((r) => r.canal.id));
  const { aviso } = await searchParams;
  const stats = await estadisticasGlobales(prisma, usuario);
  const porSlug = new Map(stats.tarjetas.map((t) => [t.slug, t]));

  return (
    <section>
      {aviso === "sin-acceso" && (
        <p role="alert" className="mb-4 rounded-xl border border-red-400/60 bg-red-950/60 px-4 py-3 text-sm text-red-100">
          No tienes acceso a esa sección.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Inicio</h1>
          <p className="mt-1 text-sm text-suave">
            {usuario.esSuperadmin ? "Todos los canales de la red." : "Los canales en los que participas."}
          </p>
        </div>
        {usuario.esSuperadmin && (
          <Link href="/canales" className="btn-primario ml-auto">
            <span aria-hidden>+</span> Agregar canal
          </Link>
        )}
      </div>

      {resumen.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-borde-campo p-8 text-center">
          <p className="text-lg font-semibold">Todavía no tienes canales</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-suave">
            {usuario.esSuperadmin ? "Agrega el primero pegando el enlace de su canal de YouTube." : "Pide a un admin que te agregue a uno."}
          </p>
          {usuario.esSuperadmin && (
            <Link href="/canales" className="btn-primario mt-4">
              Agregar un canal
            </Link>
          )}
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {resumen.map(({ canal, total, porEstado, proxima }) => {
            const color = colorSeguro(canal.colorAcento, acentoPanel());
            const t = porSlug.get(canal.slug);
            const alerta = alertas.get(canal.id);
            const activos = ESTADOS_VIDEO.filter((e) => porEstado[e] > 0);
            return (
              <li key={canal.id}>
                <Link
                  href={`/estadisticas?canal=${encodeURIComponent(canal.slug)}`}
                  style={{ "--acento": color } as React.CSSProperties}
                  className="flex h-full flex-col rounded-2xl border border-borde bg-superficie p-5 transition hover:border-acento hover:bg-superficie-alta"
                >
                  <div className="flex items-start gap-3">
                    <AvatarCanal nombre={canal.nombre} avatarUrl={t?.avatarUrl} color={color} tamano="lg" />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-lg font-semibold">{canal.nombre}</h2>
                      <p className="truncate text-sm text-suave">{t?.handle ?? (t?.vinculado ? "" : "Sin enlace de YouTube")}</p>
                    </div>
                    {(alerta?.total ?? 0) > 0 && (
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${alerta!.graves ? "border-red-400/70 text-red-200" : "border-amber-400/70 text-amber-200"}`}
                      >
                        {alerta!.total} alerta{alerta!.total === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>

                  {t?.vinculado ? (
                    <dl className="mt-5 grid grid-cols-2 gap-4">
                      <div>
                        <dt className="text-xs text-suave">Suscriptores</dt>
                        <dd className="mt-1 flex flex-wrap items-baseline gap-2">
                          <span className="text-3xl font-semibold tabular-nums">{compacto(t.suscriptores)}</span>
                          <Variacion valor={t.subs28} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-suave">Vistas totales</dt>
                        <dd className="mt-1 text-3xl font-semibold tabular-nums">{compacto(t.vistasTotales)}</dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="mt-5 rounded-xl bg-fondo px-3 py-2.5 text-sm text-suave">
                      Pega el enlace de su canal de YouTube en <span className="text-texto">Canales</span> para ver suscriptores y vistas.
                    </p>
                  )}

                  <div className="mt-5 rounded-xl bg-fondo px-4 py-3">
                    <p className="text-xs text-suave">Próxima publicación</p>
                    {proxima ? (
                      <>
                        <p className="mt-0.5 text-sm font-semibold">{formatearFechaHora(proxima.fechaPublicacion, canal.zonaHoraria, canal.idioma)}</p>
                        <p className="mt-0.5 line-clamp-2 text-sm">{proxima.titulo}</p>
                      </>
                    ) : (
                      <p className="mt-0.5 text-sm text-suave">Sin publicaciones programadas.</p>
                    )}
                  </div>

                  <div className="mt-auto pt-4">
                    <p className="text-xs text-suave">
                      {total} video{total === 1 ? "" : "s"} en el tablero
                    </p>
                    {activos.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Videos por estado">
                        {activos.map((e) => (
                          <li key={e} className="rounded-full border border-borde px-2.5 py-0.5 text-xs">
                            {NOMBRE_ESTADO[e]} <span className="font-semibold tabular-nums">{porEstado[e]}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
