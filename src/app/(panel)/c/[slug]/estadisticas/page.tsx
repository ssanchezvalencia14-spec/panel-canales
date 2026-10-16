import Link from "next/link";
import { notFound } from "next/navigation";
import { BarrasHorizontales } from "@/components/graficos";
import { NOMBRE_PLATAFORMA } from "@/lib/dominio/plataformas";
import { puede } from "@/lib/dominio/roles";
import { combinarMetricas } from "@/lib/metricas/resultados";
import { prisma } from "@/server/db";
import { obtenerCanalPorSlug } from "@/server/acceso";
import { estadisticasDeCanal, integracionDeCanal } from "@/server/metricas";
import { requireUsuario } from "@/server/sesion";

export default async function Estadisticas({ params }: PageProps<"/c/[slug]/estadisticas">) {
  const { slug } = await params;
  const usuario = await requireUsuario();
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal) notFound();

  const [{ videos, resultados }, integ] = await Promise.all([
    estadisticasDeCanal(prisma, usuario, canal.id),
    integracionDeCanal(prisma, usuario, canal.id),
  ]);
  const medidos = videos.filter((v) => v.total);
  const red = combinarMetricas(medidos.map((v) => v.total!));
  const n = (v: number | null, dec = 0) => (v === null ? "—" : new Intl.NumberFormat(canal.idioma, { maximumFractionDigits: dec }).format(v));
  const base = `/c/${canal.slug}`;
  const edita = puede(usuario, canal.id, "editar_video");
  const admin = puede(usuario, canal.id, "configurar_canal");
  const grupo = (g: { clave: string; vistasPromedio: number; videos: number }) => ({
    etiqueta: g.clave,
    valor: g.vistasPromedio,
    detalle: `${g.videos} video(s), promedio`,
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {edita && (
          <Link href={`${base}/estadisticas/cargar`} className="rounded-md bg-acento px-3 py-1.5 font-semibold text-fondo">
            Cargar métricas
          </Link>
        )}
        <a href={`${base}/estadisticas/exportar`} className="rounded-md border border-borde px-3 py-1.5 hover:border-acento">
          Exportar CSV
        </a>
        <Link href={`${base}/integraciones`} className="rounded-md border border-borde px-3 py-1.5 hover:border-acento">
          {integ ? "Google conectado" : admin ? "Conectar Google" : "Integraciones"}
        </Link>
        {integ?.ultimaSincronizacion && (
          <span className="text-xs text-suave">Última sincronización: {integ.ultimaSincronizacion.toISOString().slice(0, 16).replace("T", " ")} UTC</span>
        )}
      </div>

      {medidos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-borde p-6 text-sm text-suave">
          Todavía no hay métricas. Registra el enlace de un video publicado en su ficha (sección Videos) y luego carga sus
          números a mano, con un CSV de YouTube Studio o TikTok, o conectando Google para traerlos de YouTube.
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Videos con métricas", `${medidos.length} de ${videos.length}`],
                ["Vistas totales", n(red.vistas)],
                ["Retención media", red.retencion === null ? "—" : `${n(red.retencion, 1)} %`],
                ["CTR medio", red.ctr === null ? "—" : `${n(red.ctr, 1)} %`],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-borde bg-superficie p-4">
                <dt className="text-xs text-suave">{k}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="-mt-3 text-xs text-suave">Retención y CTR ponderados por vistas. Los totales usan la última medición de cada publicación.</p>

          <div className="rounded-lg border border-borde bg-superficie p-4">
            <h2 className="font-semibold">Vistas por video</h2>
            <div className="mt-3">
              <BarrasHorizontales
                idioma={canal.idioma}
                datos={[...medidos]
                  .sort((a, b) => (b.total!.vistas ?? 0) - (a.total!.vistas ?? 0))
                  .map((v) => ({
                    etiqueta: v.titulo,
                    valor: v.total!.vistas ?? 0,
                    detalle: v.publicaciones.map((p) => NOMBRE_PLATAFORMA[p.plataforma]).join(" + "),
                  }))}
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {(
              [
                ["Mejor pilar", resultados.porPilar],
                ["Mejor hora de publicación", resultados.porHora],
                ["Mejor día", resultados.porDia],
              ] as const
            ).map(([titulo, grupos]) => (
              <div key={titulo} className="rounded-lg border border-borde bg-superficie p-4">
                <h2 className="font-semibold">{titulo}</h2>
                <p className="text-xs text-suave">Vistas promedio por video</p>
                <div className="mt-3">
                  <BarrasHorizontales idioma={canal.idioma} datos={grupos.map(grupo)} unidad="vistas promedio" />
                </div>
              </div>
            ))}
          </div>
          {resultados.conMetricas < 5 && (
            <p className="-mt-2 text-xs text-amber-300">
              Con {resultados.conMetricas} video(s) medidos, estas comparaciones son orientativas; ganan sentido con más publicaciones.
            </p>
          )}

          <div className="rounded-lg border border-borde bg-superficie p-4">
            <h2 className="font-semibold">Comparación de ganchos</h2>
            {resultados.ganchos.length === 0 ? (
              <p className="mt-2 text-sm text-suave">Ningún video medido tiene gancho registrado todavía.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-suave">
                    <tr>
                      <th className="px-2 py-1 font-medium">Gancho</th>
                      <th className="px-2 py-1 font-medium">Video</th>
                      <th className="px-2 py-1 text-right font-medium">Puntaje</th>
                      <th className="px-2 py-1 text-right font-medium">Vistas</th>
                      <th className="px-2 py-1 text-right font-medium">Retención</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultados.ganchos.map((g) => (
                      <tr key={g.titulo} className="border-t border-borde">
                        <td className="px-2 py-1">{g.gancho}</td>
                        <td className="px-2 py-1 text-suave">{g.titulo}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{n(g.scoreGancho, 1)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{n(g.vistas)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{g.retencion === null ? "—" : `${n(g.retencion, 1)} %`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-borde">
            <h2 className="border-b border-borde bg-superficie px-3 py-2 font-semibold">Tabla de métricas</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-suave">
                  <tr>
                    {["Video", "Pilar", "Vistas", "Retención", "CTR", "Likes", "Coment.", "Compart.", "Subs"].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {medidos.map((v) => (
                    <tr key={v.id} className="border-t border-borde tabular-nums">
                      <td className="px-3 py-2">
                        <Link href={`${base}/videos/${v.id}`} className="hover:text-acento hover:underline">
                          {v.titulo}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-suave">{v.pilar ?? "—"}</td>
                      <td className="px-3 py-2">{n(v.total!.vistas)}</td>
                      <td className="px-3 py-2">{v.total!.retencion === null ? "—" : `${n(v.total!.retencion, 1)} %`}</td>
                      <td className="px-3 py-2">{v.total!.ctr === null ? "—" : `${n(v.total!.ctr, 1)} %`}</td>
                      <td className="px-3 py-2">{n(v.total!.likes)}</td>
                      <td className="px-3 py-2">{n(v.total!.comentarios)}</td>
                      <td className="px-3 py-2">{n(v.total!.compartidos)}</td>
                      <td className="px-3 py-2">{n(v.total!.suscriptores)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
