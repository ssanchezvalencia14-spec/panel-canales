import Link from "next/link";
import { notFound } from "next/navigation";
import { NOMBRE_ROL, puedeAdministrarRed } from "@/lib/dominio/roles";
import { dirRespaldos, listarRespaldos } from "@/lib/respaldo-disco";
import { prisma } from "@/server/db";
import { auditoriaRed } from "@/server/auditoria";
import { NOMBRE_TIPO_EJECUCION } from "@/server/produccion";
import { requireUsuario } from "@/server/sesion";

const fecha = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");
const usd = (n: number) => `US$ ${n.toFixed(2)}`;
const tarjeta = "rounded-lg border border-borde bg-superficie p-4";

export default async function Auditoria() {
  const usuario = await requireUsuario();
  if (!puedeAdministrarRed(usuario)) notFound();
  const [a, respaldos] = await Promise.all([auditoriaRed(prisma, usuario), listarRespaldos()]);
  const faltan = a.configuracion.filter((c) => !c.definida && c.nombre !== "RESPALDOS_DIR" && c.nombre !== "ANTHROPIC_API_KEY");

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Auditoría de la red</h1>
        <p className="mt-1 text-sm text-suave">Quién tiene acceso a qué, conexiones, fallos de los últimos 30 días, gasto del mes y respaldos.</p>
      </div>

      <div className={tarjeta}>
        <h2 className="font-semibold">Configuración del servidor</h2>
        <p className="mt-1 text-xs text-suave">Solo se muestra si cada variable existe, nunca su valor.</p>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {a.configuracion.map((c) => (
            <li key={c.nombre} className="flex gap-2">
              <span aria-hidden className={c.definida ? "text-emerald-400" : "text-amber-400"}>{c.definida ? "✓" : "!"}</span>
              <span className="font-mono text-xs leading-5">{c.nombre}</span>
              <span className="text-suave">{c.uso}{c.definida ? "" : " · falta"}</span>
            </li>
          ))}
        </ul>
        {faltan.length > 0 && <p className="mt-2 text-xs text-amber-300">Faltan {faltan.length} variable(s): las funciones que dependen de ellas no estarán disponibles.</p>}
      </div>

      <div className="rounded-lg border border-borde">
        <h2 className="border-b border-borde bg-superficie px-3 py-2 font-semibold">Usuarios y roles ({a.usuarios.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-suave">
              <tr>
                <th className="px-3 py-2 font-normal">Correo</th>
                <th className="px-3 py-2 font-normal">Acceso</th>
                <th className="px-3 py-2 font-normal">Estado</th>
                <th className="px-3 py-2 text-right font-normal">Sesiones abiertas</th>
              </tr>
            </thead>
            <tbody>
              {a.usuarios.map((x) => (
                <tr key={x.id} className="border-t border-borde align-top">
                  <td className="px-3 py-2">{x.email}</td>
                  <td className="px-3 py-2">
                    {x.esSuperadmin ? (
                      <span className="text-acento">{NOMBRE_ROL.superadmin}</span>
                    ) : x.membresias.length === 0 ? (
                      <span className="text-amber-300">Sin canal</span>
                    ) : (
                      x.membresias.map((m) => (
                        <span key={m.canal.slug} className="mr-2 inline-block">
                          {m.canal.nombre}: {NOMBRE_ROL[m.rol]}
                        </span>
                      ))
                    )}
                  </td>
                  <td className="px-3 py-2">{x.activo ? "Activo" : <span className="text-suave">Desactivado</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{x.sesionesActivas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-borde px-3 py-2 text-xs text-suave">Los roles se cambian en la sección Equipo de cada canal. Un usuario desactivado no puede entrar aunque tenga sesión.</p>
      </div>

      <div className={tarjeta}>
        <h2 className="font-semibold">Integraciones</h2>
        {a.integraciones.length === 0 ? (
          <p className="mt-2 text-sm text-suave">Ningún canal tiene Google conectado.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {a.integraciones.map((i) => (
              <li key={`${i.canal.slug}-${i.proveedor}`}>
                <span className="font-medium">{i.canal.nombre}</span> · {i.proveedor} · {i.cuenta ?? "cuenta sin nombre"}
                <span className="text-suave"> · conectada por {i.conectadoPor?.email ?? "?"} · última sincronización {i.ultimaSincronizacion ? fecha(i.ultimaSincronizacion) : "nunca"}</span>
                {i.ultimoError && <p className="text-xs text-red-300">Último error: {i.ultimoError.slice(0, 200)}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={tarjeta}>
        <h2 className="font-semibold">Gasto del mes por canal</h2>
        <table className="mt-2 w-full max-w-xl text-sm">
          <thead className="text-left text-xs text-suave">
            <tr>
              <th className="py-1 font-normal">Canal</th>
              <th className="py-1 text-right font-normal">Gastado</th>
              <th className="py-1 text-right font-normal">Tope mensual</th>
            </tr>
          </thead>
          <tbody>
            {a.gasto.map((g) => (
              <tr key={g.canal.id} className="border-t border-borde">
                <td className="py-1">
                  <Link href={`/c/${g.canal.slug}/ejecuciones`} className="hover:text-acento hover:underline">
                    {g.canal.nombre}
                  </Link>
                </td>
                <td className="py-1 text-right tabular-nums">{usd(g.gastado)}</td>
                <td className={`py-1 text-right tabular-nums ${g.tope !== null && g.gastado >= g.tope * 0.9 ? "text-amber-300" : ""}`}>{g.tope === null ? "sin tope" : usd(g.tope)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={tarjeta}>
        <h2 className="font-semibold">Fallos de los últimos 30 días ({a.fallos.length})</h2>
        {a.fallos.length === 0 ? (
          <p className="mt-2 text-sm text-emerald-300">Sin ejecuciones con error.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {a.fallos.map((e) => (
              <li key={e.id}>
                <span className="text-suave tabular-nums">{fecha(e.creadoEn)}</span> · {e.canal.slug} · {NOMBRE_TIPO_EJECUCION[e.tipo] ?? e.tipo}
                {e.video && (
                  <>
                    {" · "}
                    <Link href={`/c/${e.canal.slug}/videos/${e.video.id}`} className="hover:text-acento hover:underline">
                      {e.video.titulo}
                    </Link>
                  </>
                )}
                {e.log && <p className="truncate text-xs text-red-300">{e.log.split("\n").pop()}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={tarjeta}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">Copias de seguridad</h2>
          <a href="/api/respaldo" className="ml-auto rounded-md border border-borde px-3 py-1.5 text-sm hover:border-acento">
            Descargar respaldo ahora
          </a>
        </div>
        <p className="mt-1 text-xs text-suave">
          El cron diario guarda una copia en <span className="font-mono">{dirRespaldos()}</span> y conserva las últimas. Descarga una copia de vez en cuando y guárdala fuera del hosting.
        </p>
        {respaldos.length === 0 ? (
          <p className="mt-2 text-sm text-amber-300">No hay respaldos en el servidor todavía (¿falta la tarea cron de respaldo?).</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {respaldos.slice(0, 7).map((r) => (
              <li key={r.nombre} className="flex justify-between gap-3">
                <span className="font-mono text-xs">{r.nombre}</span>
                <span className="text-suave tabular-nums">{(r.bytes / 1024).toFixed(1)} KB</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={tarjeta}>
        <h2 className="font-semibold">Actividad reciente de la red</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {a.actividad.map((x) => (
            <li key={x.id} className="flex flex-wrap gap-x-3">
              <span className="text-suave tabular-nums">{fecha(x.creadoEn)}</span>
              <span className="text-suave">{x.canal.slug}</span>
              <span>{x.resumen}</span>
              <span className="text-xs text-suave">{x.user?.email ?? "sistema"}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
