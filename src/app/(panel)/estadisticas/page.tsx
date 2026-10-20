import Link from "next/link";
import { ActualizarDatos } from "@/components/actualizar-datos";
import { AvatarCanal } from "@/components/avatar-canal";
import { FiltroCanal } from "@/components/filtro-canal";
import { BarrasHorizontales, LineaTiempo } from "@/components/graficos";
import { compacto, conSigno, entero, haceCuanto } from "@/lib/formato";
import { puedeAdministrarRed } from "@/lib/dominio/roles";
import { esShort, imagenSegura } from "@/lib/youtube/estadisticas";
import { actualizarAhoraAccion } from "@/server/acciones/youtube-publico";
import { prisma } from "@/server/db";
import { listarCanales } from "@/server/acceso";
import { requireUsuario } from "@/server/sesion";
import { estadisticasGlobales, type VideoDestacado } from "@/server/youtube-publico";

function Kpi({ etiqueta, valor, detalle, destacado = false }: { etiqueta: string; valor: string; detalle?: string; destacado?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-superficie p-4 sm:p-5 ${destacado ? "border-primario/60" : "border-borde"}`}>
      {destacado && <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-primario" />}
      <dt className="text-xs font-medium tracking-wide text-suave uppercase">{etiqueta}</dt>
      <dd className="mt-2 text-3xl leading-none font-bold tabular-nums sm:text-5xl">{valor}</dd>
      {detalle && <p className="mt-2 text-xs text-suave sm:text-sm">{detalle}</p>}
    </div>
  );
}

function ListaVideos({ titulo, videos, mostrarCanal }: { titulo: string; videos: VideoDestacado[]; mostrarCanal: boolean }) {
  return (
    <div className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
      <h2 className="font-semibold">{titulo}</h2>
      {videos.length === 0 ? (
        <p className="mt-3 text-sm text-suave">Sin videos todavía.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {videos.map((v) => {
            const mini = imagenSegura(v.miniaturaUrl);
            return (
              <li key={`${v.canalSlug}-${v.youtubeId}`} className="flex items-center gap-3">
                {mini ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mini} alt="" loading="lazy" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span aria-hidden className="inline-flex h-12 w-20 shrink-0 items-center justify-center rounded-lg bg-fondo text-suave">
                    ▶
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <a href={`https://www.youtube.com/watch?v=${v.youtubeId}`} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-sm font-medium hover:text-acento">
                    {v.titulo}
                  </a>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-suave">
                    {mostrarCanal && (
                      <span className="inline-flex items-center gap-1">
                        <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: v.color }} />
                        {v.canalNombre}
                      </span>
                    )}
                    <span>{new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(v.publicadoEn)}</span>
                    {esShort(v.duracionSeg) && <span className="rounded border border-borde px-1">Short</span>}
                  </p>
                </div>
                <div className="text-right text-sm tabular-nums">
                  <p className="font-semibold">{compacto(v.vistas)}</p>
                  <p className="text-xs text-suave">vistas</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export default async function EstadisticasGlobales({ searchParams }: PageProps<"/estadisticas">) {
  const { canal: canalParam } = await searchParams;
  const usuario = await requireUsuario();
  const visibles = await listarCanales(prisma, usuario);
  const slug = typeof canalParam === "string" && visibles.some((c) => c.slug === canalParam) ? canalParam : null;
  const d = await estadisticasGlobales(prisma, usuario, { slug: slug ?? undefined });
  const t = d.totales;
  const admin = puedeAdministrarRed(usuario);
  const filtro = d.filtro.map((f) => ({ ...f, color: d.tarjetas.find((x) => x.slug === f.slug)?.color }));
  const conFallo = d.tarjetas.filter((x) => x.vinculado && x.error);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold sm:text-3xl">Estadísticas</h1>
        <div className="ml-auto">
          <ActualizarDatos
            accion={actualizarAhoraAccion}
            actualizadoEn={t.vinculados === 0 ? "Sin canales vinculados" : `Datos de YouTube: ${haceCuanto(d.actualizadoEn)}`}
          />
        </div>
      </div>

      <FiltroCanal canales={filtro} actual={slug} ruta="/estadisticas" />

      {conFallo.length > 0 && (
        <div role="alert" className="rounded-xl border border-red-400/60 bg-red-950/60 p-4 text-sm text-red-100">
          <p className="font-medium">No se pudieron actualizar {conFallo.length} canal(es):</p>
          <ul className="mt-1 list-disc pl-5 text-red-200">
            {conFallo.map((c) => (
              <li key={c.slug}>
                {c.nombre}: {c.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {t.vinculados === 0 ? (
        <div className="rounded-2xl border border-dashed border-borde-campo p-8 text-center">
          <p className="text-lg font-semibold">Todavía no hay canales con estadísticas</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-suave">
            {admin
              ? "Pega el enlace de un canal de YouTube y el panel trae sus suscriptores, vistas y videos. No pide contraseñas."
              : "Pide a un superadmin que agregue los canales pegando su enlace de YouTube."}
          </p>
          {admin && (
            <Link href="/canales" className="btn-primario mt-4">
              Agregar un canal
            </Link>
          )}
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi destacado etiqueta="Suscriptores" valor={compacto(t.suscriptores)} detalle={t.subs28 === null ? "El crecimiento aparece con el historial diario" : `${conSigno(t.subs28)} en 28 días · ${conSigno(t.subs7)} en 7 días`} />
            <Kpi etiqueta="Vistas totales" valor={compacto(t.vistasTotales)} detalle={`${entero(t.videosTotales)} videos en total`} />
            <Kpi etiqueta="Vistas de lo reciente" valor={compacto(t.vistasRecientes)} detalle={`${t.videosRecientes} video(s) de los últimos 28 días`} />
            <Kpi etiqueta="Canales" valor={String(t.vinculados)} detalle={t.vinculados < t.canales ? `${t.canales - t.vinculados} sin enlace de YouTube` : "todos con datos"} />
          </dl>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
              <h2 className="font-semibold">Suscriptores en el tiempo</h2>
              <div className="mt-3">
                {d.serieSuscriptores.length > 1 ? (
                  <LineaTiempo puntos={d.serieSuscriptores} idioma="es" etiqueta="suscriptores" />
                ) : (
                  <p className="text-sm text-suave">El panel guarda una foto al día. La gráfica aparece desde el segundo día de datos.</p>
                )}
              </div>
            </div>
            {d.tarjetas.length > 1 ? (
              <div className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
                <h2 className="font-semibold">Vistas de los últimos 28 días por canal</h2>
                <p className="text-xs text-suave">Vistas acumuladas de los videos publicados en ese periodo</p>
                <div className="mt-3">
                  <BarrasHorizontales
                    idioma="es"
                    unidad="vistas"
                    datos={d.tarjetas.filter((x) => x.vinculado).map((x) => ({ etiqueta: x.nombre, valor: x.vistasRecientes, detalle: `${x.videosRecientes} video(s)` })).sort((a, b) => b.valor - a.valor)}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
                <h2 className="font-semibold">Más vistos</h2>
                <BarrasHorizontales idioma="es" unidad="vistas" datos={d.masVistos.slice(0, 6).map((v) => ({ etiqueta: v.titulo, valor: v.vistas ?? 0 }))} />
              </div>
            )}
          </div>

          {d.tarjetas.length > 1 && (
            <div className="overflow-hidden rounded-2xl border border-borde">
              <h2 className="border-b border-borde bg-superficie px-4 py-3 font-semibold">Canales</h2>
              {/* Móvil: una tarjeta por canal. */}
              <ul className="divide-y divide-borde md:hidden">
                {d.tarjetas.map((c) => (
                  <li key={c.slug}>
                    <Link href={`/estadisticas?canal=${encodeURIComponent(c.slug)}`} className="flex items-center gap-3 px-4 py-3 hover:bg-superficie">
                      <AvatarCanal nombre={c.nombre} avatarUrl={c.avatarUrl} color={c.color} tamano="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{c.nombre}</p>
                        <p className="truncate text-xs text-suave">
                          {c.vinculado ? `${conSigno(c.subs28)} en 28 d · ${compacto(c.vistasTotales)} vistas · ${haceCuanto(c.actualizadoEn)}` : "Sin enlace de YouTube"}
                        </p>
                      </div>
                      {c.vinculado && (
                        <p className="text-right tabular-nums">
                          <span className="block text-lg font-semibold">{compacto(c.suscriptores)}</span>
                          <span className="text-xs text-suave">suscriptores</span>
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="text-xs text-suave">
                    <tr>
                      {["Canal", "Suscriptores", "7 días", "28 días", "Vistas totales", "Videos", "Actualizado"].map((h, i) => (
                        <th key={h} className={`px-4 py-2 font-medium ${i > 0 && i < 6 ? "text-right" : ""}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.tarjetas.map((c) => {
                      const avatar = imagenSegura(c.avatarUrl);
                      return (
                        <tr key={c.slug} className="border-t border-borde tabular-nums">
                          <td className="px-4 py-2.5">
                            <Link href={`/estadisticas?canal=${encodeURIComponent(c.slug)}`} className="flex items-center gap-2.5 font-medium hover:text-acento">
                              <AvatarCanal nombre={c.nombre} avatarUrl={avatar} color={c.color} tamano="sm" />
                              <span>
                                {c.nombre}
                                {c.handle && <span className="ml-2 text-xs font-normal text-suave">{c.handle}</span>}
                              </span>
                            </Link>
                          </td>
                          {c.vinculado ? (
                            <>
                              <td className="px-4 py-2.5 text-right">{compacto(c.suscriptores)}</td>
                              <td className="px-4 py-2.5 text-right">{conSigno(c.subs7)}</td>
                              <td className="px-4 py-2.5 text-right">{conSigno(c.subs28)}</td>
                              <td className="px-4 py-2.5 text-right">{compacto(c.vistasTotales)}</td>
                              <td className="px-4 py-2.5 text-right">{entero(c.videosTotales)}</td>
                              <td className="px-4 py-2.5 text-xs text-suave">{haceCuanto(c.actualizadoEn)}</td>
                            </>
                          ) : (
                            <td colSpan={6} className="px-4 py-2.5 text-xs text-suave">
                              Sin enlace de YouTube
                              {admin && (
                                <>
                                  {" · "}
                                  <Link href="/canales" className="text-acento hover:underline">
                                    vincular
                                  </Link>
                                </>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <ListaVideos titulo="Más vistos" videos={d.masVistos} mostrarCanal={d.tarjetas.length > 1} />
            <ListaVideos titulo="Últimas publicaciones" videos={d.recientes} mostrarCanal={d.tarjetas.length > 1} />
          </div>

          <p className="text-xs text-suave">
            Cifras públicas de YouTube, actualizadas cada pocos minutos. Para retención, CTR e ingresos, conecta Google desde las estadísticas de producción de cada canal.
          </p>
        </>
      )}
    </section>
  );
}
