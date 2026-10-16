import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoVideoChip } from "@/components/estado-video";
import { BotonAccion, FormularioMetricas, FormularioPublicacion } from "@/components/estadisticas-formularios";
import { LineaTiempo } from "@/components/graficos";
import { fechaLocal, formatearFechaHora } from "@/lib/dominio/fechas";
import { NOMBRE_PLATAFORMA } from "@/lib/dominio/plataformas";
import { puede } from "@/lib/dominio/roles";
import { prisma } from "@/server/db";
import { obtenerCanalPorSlug } from "@/server/acceso";
import { metricaManualAccion, quitarPublicacionAccion, registrarPublicacionAccion } from "@/server/acciones/estadisticas";
import { fichaDeVideo } from "@/server/metricas";
import { requireUsuario } from "@/server/sesion";

const FUENTE: Record<string, string> = { youtube_api: "YouTube API", csv: "CSV", manual: "Manual" };

export default async function FichaVideo({ params }: PageProps<"/c/[slug]/videos/[id]">) {
  const { slug, id } = await params;
  const usuario = await requireUsuario();
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal) notFound();
  const video = await fichaDeVideo(prisma, usuario, canal.id, id);
  if (!video) notFound();

  const edita = puede(usuario, canal.id, "editar_video");
  const hoy = fechaLocal(new Date(), canal.zonaHoraria);
  const n = (v: number | null | undefined, dec = 0) =>
    v === null || v === undefined ? "—" : new Intl.NumberFormat(canal.idioma, { maximumFractionDigits: dec }).format(v);

  return (
    <section className="space-y-6">
      <Link href={`/c/${canal.slug}/videos`} className="text-sm text-suave hover:text-texto">
        ← Videos
      </Link>

      <div className="rounded-lg border border-borde bg-superficie p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">{video.titulo}</h2>
          <EstadoVideoChip estado={video.estado} />
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-suave">Publicación prevista</dt>
            <dd>{video.fechaPublicacion ? formatearFechaHora(video.fechaPublicacion, canal.zonaHoraria, canal.idioma) : "Sin fecha"}</dd>
          </div>
          <div>
            <dt className="text-suave">Pilar</dt>
            <dd>{video.pilar ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-suave">Gancho</dt>
            <dd>
              {video.gancho ?? "—"}
              {video.scoreGancho !== null && <span className="ml-2 text-suave">(puntaje {n(video.scoreGancho, 1)})</span>}
            </dd>
          </div>
          <div>
            <dt className="text-suave">Fuentes y aprobación</dt>
            <dd>
              {video.fuentesOk ? "Fuentes verificadas" : "Fuentes pendientes"} ·{" "}
              {video.aprobadoEn ? `aprobado por ${video.aprobadoPor?.name ?? video.aprobadoPor?.email}` : "sin aprobación"}
            </dd>
          </div>
          {video.notas && (
            <div className="sm:col-span-2">
              <dt className="text-suave">Notas</dt>
              <dd>{video.notas}</dd>
            </div>
          )}
        </dl>
      </div>

      <div>
        <h3 className="text-lg font-semibold">Publicaciones y métricas</h3>
        {video.estado !== "publicado" && video.publicaciones.length > 0 && (
          <p className="mt-1 text-xs text-amber-300">
            Este video tiene publicaciones registradas pero en el panel sigue en «{video.estado}». La aprobación y el paso a
            «publicado» se hacen en el flujo del tablero.
          </p>
        )}

        {video.publicaciones.length === 0 && <p className="mt-2 text-sm text-suave">Todavía no hay publicaciones registradas.</p>}

        <div className="mt-3 space-y-4">
          {video.publicaciones.map((p) => {
            const ultima = p.metricas.at(-1);
            return (
              <article key={p.id} className="rounded-lg border border-borde bg-superficie p-4">
                <header className="flex flex-wrap items-center gap-3">
                  <h4 className="font-medium">{NOMBRE_PLATAFORMA[p.plataforma]}</h4>
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="truncate text-sm text-acento underline">
                      {p.url}
                    </a>
                  )}
                  {p.publicada && <span className="text-xs text-suave">publicado {fechaLocal(p.publicada, canal.zonaHoraria)}</span>}
                  {edita && (
                    <div className="ml-auto">
                      <BotonAccion
                        accion={quitarPublicacionAccion.bind(null, canal.slug, p.id)}
                        texto="Quitar"
                        pendienteTexto="Quitando…"
                        confirmar="¿Quitar esta publicación y sus métricas del panel?"
                      />
                    </div>
                  )}
                </header>

                {ultima ? (
                  <>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-7">
                      {(
                        [
                          ["Vistas", n(ultima.vistas)],
                          ["Retención", ultima.retencion === null ? "—" : `${n(ultima.retencion, 1)} %`],
                          ["CTR", ultima.ctr === null ? "—" : `${n(ultima.ctr, 1)} %`],
                          ["Likes", n(ultima.likes)],
                          ["Comentarios", n(ultima.comentarios)],
                          ["Compartidos", n(ultima.compartidos)],
                          ["Suscriptores", n(ultima.suscriptores)],
                        ] as const
                      ).map(([k, v]) => (
                        <div key={k} className="rounded-md bg-fondo p-2">
                          <dt className="text-xs text-suave">{k}</dt>
                          <dd className="text-base font-semibold tabular-nums">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-1 text-xs text-suave">
                      Al {ultima.fecha.toISOString().slice(0, 10)} · fuente: {FUENTE[ultima.fuente]}
                    </p>
                    {p.metricas.length > 1 && (
                      <div className="mt-3">
                        <p className="text-sm font-medium">Vistas acumuladas</p>
                        <LineaTiempo
                          idioma={canal.idioma}
                          etiqueta="vistas"
                          puntos={p.metricas.filter((m) => m.vistas !== null).map((m) => ({ fecha: m.fecha.toISOString().slice(0, 10), valor: m.vistas! }))}
                        />
                      </div>
                    )}
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer text-suave">Ver las {p.metricas.length} mediciones</summary>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full min-w-[560px] text-left text-xs">
                          <thead className="text-suave">
                            <tr>
                              {["Fecha", "Vistas", "Ret. %", "CTR %", "Likes", "Coment.", "Compart.", "Subs", "Fuente"].map((h) => (
                                <th key={h} className="px-2 py-1 font-medium">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {p.metricas.map((m) => (
                              <tr key={m.fecha.toISOString()} className="border-t border-borde tabular-nums">
                                <td className="px-2 py-1">{m.fecha.toISOString().slice(0, 10)}</td>
                                <td className="px-2 py-1">{n(m.vistas)}</td>
                                <td className="px-2 py-1">{n(m.retencion, 1)}</td>
                                <td className="px-2 py-1">{n(m.ctr, 1)}</td>
                                <td className="px-2 py-1">{n(m.likes)}</td>
                                <td className="px-2 py-1">{n(m.comentarios)}</td>
                                <td className="px-2 py-1">{n(m.compartidos)}</td>
                                <td className="px-2 py-1">{n(m.suscriptores)}</td>
                                <td className="px-2 py-1">{FUENTE[m.fuente]}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-suave">Sin métricas todavía.</p>
                )}

                {edita && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-acento">Cargar métricas a mano</summary>
                    <div className="mt-2">
                      <FormularioMetricas accion={metricaManualAccion.bind(null, canal.slug, p.id)} hoy={hoy} />
                    </div>
                  </details>
                )}
              </article>
            );
          })}
        </div>

        {edita && (
          <div className="mt-4 rounded-lg border border-dashed border-borde p-4">
            <p className="mb-2 text-sm font-medium">Registrar una publicación</p>
            <FormularioPublicacion accion={registrarPublicacionAccion.bind(null, canal.slug, video.id)} />
          </div>
        )}
      </div>
    </section>
  );
}
