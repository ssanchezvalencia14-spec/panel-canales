import Link from "next/link";
import { notFound } from "next/navigation";
import { claseCampo } from "@/components/clases";
import { FormularioAccion } from "@/components/formulario-accion";
import { FormularioEjecucion, TablaEjecuciones } from "@/components/produccion-video";
import { puede } from "@/lib/dominio/roles";
import { prisma } from "@/server/db";
import { listarVideosDeCanal, obtenerCanalPorSlug } from "@/server/acceso";
import { topeCanalAccion, topeMensualAccion } from "@/server/acciones/produccion";
import { gastoMensualCanal, listarEjecuciones, NOMBRE_TIPO_EJECUCION } from "@/server/produccion";
import { requireUsuario } from "@/server/sesion";
import { listarActividad } from "@/server/actividad";

const usd = (n: number) => `US$ ${n.toFixed(2)}`;

export default async function Ejecuciones({ params }: PageProps<"/c/[slug]/ejecuciones">) {
  const { slug } = await params;
  const usuario = await requireUsuario();
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal) notFound();

  const [ejecuciones, videos, actividad, mes] = await Promise.all([
    listarEjecuciones(prisma, usuario, canal.id),
    listarVideosDeCanal(prisma, usuario, canal.id),
    listarActividad(prisma, canal.id, undefined, 100),
    gastoMensualCanal(prisma, usuario, canal.id),
  ]);
  const usoMes = mes.tope ? Math.min(100, (mes.gastado / mes.tope) * 100) : null;
  const edita = puede(usuario, canal.id, "editar_video");
  const admin = puede(usuario, canal.id, "configurar_canal");
  const tope = canal.limiteGastoVideo === null ? null : Number(canal.limiteGastoVideo);

  const porVideo = new Map<string, { titulo: string; total: number }>();
  for (const e of ejecuciones) {
    if (!e.video) continue;
    const previo = porVideo.get(e.video.id) ?? { titulo: e.video.titulo, total: 0 };
    previo.total += Number(e.costo ?? 0);
    porVideo.set(e.video.id, previo);
  }
  const total = ejecuciones.reduce((a, e) => a + Number(e.costo ?? 0), 0);
  const conGasto = [...porVideo.entries()].sort((a, b) => b[1].total - a[1].total);

  return (
    <section className="space-y-6">
      <p className="max-w-3xl text-sm text-suave">
        Tareas que se hacen fuera del panel (voz, imágenes, subtítulos, render en la PC) y las que hace el panel (borradores con IA,
        sincronizaciones). Cada una guarda estado, costo, enlace de salida y log. El panel no renderiza video.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
          <p className="text-xs text-suave">Gasto registrado (últimas 200)</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{usd(total)}</p>
        </div>
        <div className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5 md:col-span-2">
          <p className="text-xs text-suave">Tope de gasto por video</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{tope === null ? "Sin tope" : usd(tope)}</p>
          {admin && (
            <FormularioAccion accion={topeCanalAccion.bind(null, canal.slug)} boton="Guardar tope" variante="secundario" className="mt-2 flex flex-wrap items-end gap-2">
              <label className="text-sm">
                Nuevo tope (USD, vacío = sin tope)
                <input name="tope" type="number" min="0" step="0.01" defaultValue={tope ?? ""} className={`${claseCampo} mt-1 w-40`} />
              </label>
            </FormularioAccion>
          )}
          <p className="mt-2 text-xs text-suave">Un admin puede fijar un tope distinto para un video en su ficha. Lo que supere el tope no se registra.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="font-semibold">Gasto del mes {mes.mes}</h2>
          <p className="text-2xl font-semibold tabular-nums">
            {usd(mes.gastado)}
            <span className="text-base font-normal text-suave"> / {mes.tope === null ? "sin tope mensual" : usd(mes.tope)}</span>
          </p>
        </div>
        {usoMes !== null && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-borde" role="meter" aria-valuenow={Math.round(usoMes)} aria-valuemin={0} aria-valuemax={100} aria-label="Uso del tope mensual">
            <div className={`h-full rounded-full ${usoMes >= 90 ? "bg-red-500" : usoMes >= 70 ? "bg-amber-400" : "bg-acento"}`} style={{ width: `${usoMes}%` }} />
          </div>
        )}
        {mes.porTipo.length > 0 && (
          <table className="mt-3 w-full max-w-lg text-sm">
            <thead className="text-left text-xs text-suave">
              <tr>
                <th className="py-1 font-normal">Tipo</th>
                <th className="py-1 text-right font-normal">Ejecuciones</th>
                <th className="py-1 text-right font-normal">Gasto</th>
              </tr>
            </thead>
            <tbody>
              {mes.porTipo.map((g) => (
                <tr key={g.tipo} className="border-t border-borde">
                  <td className="py-1">{NOMBRE_TIPO_EJECUCION[g.tipo] ?? g.tipo}</td>
                  <td className="py-1 text-right tabular-nums">{g.cantidad}</td>
                  <td className="py-1 text-right tabular-nums">{usd(g.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {admin && (
          <FormularioAccion accion={topeMensualAccion.bind(null, canal.slug)} boton="Guardar tope mensual" variante="secundario" className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-sm">
              Tope mensual del canal (USD, vacío = sin tope)
              <input name="tope" type="number" min="0" step="0.01" defaultValue={mes.tope ?? ""} className={`${claseCampo} mt-1 w-40`} />
            </label>
          </FormularioAccion>
        )}
        <p className="mt-2 text-xs text-suave">Suma todo lo del canal (IA, investigación y tareas externas). Lo que pase el tope mensual no se ejecuta ni se registra.</p>
      </div>

      {conGasto.length > 0 && (
        <div className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
          <h2 className="font-semibold">Gasto por video</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {conGasto.map(([id, g]) => (
              <li key={id} className="flex justify-between gap-3">
                <Link href={`/c/${canal.slug}/videos/${id}`} className="truncate hover:text-acento hover:underline">
                  {g.titulo}
                </Link>
                <span className="tabular-nums">
                  {usd(g.total)}
                  {tope !== null && <span className="text-suave"> / {usd(tope)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {edita && (
        <details className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
          <summary className="cursor-pointer font-semibold">Registrar tarea externa</summary>
          <FormularioEjecucion slug={canal.slug} videoId={null} videos={videos.map((v) => ({ id: v.id, titulo: v.titulo }))} />
        </details>
      )}

      <TablaEjecuciones slug={canal.slug} ejecuciones={ejecuciones} edita={edita} conVideo />

      <div className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
        <h2 className="font-semibold">Registro de actividad</h2>
        {actividad.length === 0 ? (
          <p className="mt-2 text-sm text-suave">Sin actividad todavía.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {actividad.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-3">
                <span className="text-suave tabular-nums">{a.creadoEn.toISOString().slice(0, 16).replace("T", " ")}</span>
                {a.video && (
                  <Link href={`/c/${canal.slug}/videos/${a.video.id}`} className="hover:text-acento hover:underline">
                    {a.video.titulo}
                  </Link>
                )}
                <span>{a.resumen}</span>
                <span className="text-xs text-suave">{a.user?.email ?? "sistema"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
