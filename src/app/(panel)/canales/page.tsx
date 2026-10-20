import Link from "next/link";
import { notFound } from "next/navigation";
import { FormularioEnlace } from "@/components/formulario-enlace";
import { colorSeguro } from "@/lib/dominio/canal-config";
import { puedeAdministrarRed } from "@/lib/dominio/roles";
import { compacto, haceCuanto } from "@/lib/formato";
import { acentoPanel } from "@/lib/panel";
import { vincularCanalAccion } from "@/server/acciones/youtube-publico";
import { prisma } from "@/server/db";
import { listarCanales } from "@/server/acceso";
import { requireUsuario } from "@/server/sesion";

export default async function Canales() {
  const usuario = await requireUsuario();
  if (!puedeAdministrarRed(usuario)) notFound();
  const canales = await listarCanales(prisma, usuario);

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Canales</h1>

      <div className="rounded-xl border border-borde bg-superficie p-5">
        <h2 className="font-semibold">Agregar un canal</h2>
        <p className="mt-1 mb-4 text-sm text-suave">
          Pega el enlace del canal (@usuario, youtube.com/channel/UC… o el enlace de cualquiera de sus videos). No hacen falta correos ni contraseñas.
        </p>
        <FormularioEnlace accion={vincularCanalAccion} />
      </div>

      <ul className="divide-y divide-borde rounded-xl border border-borde">
        {canales.length === 0 && <li className="p-4 text-sm text-suave">Aún no hay canales.</li>}
        {canales.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
            <span aria-hidden className="h-3 w-3 rounded-full" style={{ backgroundColor: colorSeguro(c.colorAcento, acentoPanel()) }} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {c.nombre} {c.youtubeHandle && <span className="text-xs font-normal text-suave">{c.youtubeHandle}</span>}
              </p>
              {c.youtubeCanalId ? (
                <p className="text-xs text-suave">
                  {c.suscriptores !== null ? `${compacto(c.suscriptores)} suscriptores · ` : ""}
                  actualizado {haceCuanto(c.statsActualizadasEn)}
                  {c.statsError && <span className="text-red-300"> · {c.statsError}</span>}
                </p>
              ) : (
                <p className="text-xs text-amber-300">Sin enlace de YouTube: pega el enlace para traer sus estadísticas.</p>
              )}
            </div>
            {c.youtubeCanalId ? (
              <div className="flex gap-3 text-sm">
                <Link href={`/estadisticas?canal=${encodeURIComponent(c.slug)}`} className="text-acento hover:underline">
                  Estadísticas
                </Link>
                <Link href={`/c/${c.slug}/integraciones`} className="text-suave hover:text-acento">
                  Conectar Google (métricas privadas)
                </Link>
              </div>
            ) : (
              <div className="w-full sm:w-96">
                <FormularioEnlace accion={vincularCanalAccion} slug={c.slug} etiqueta="Vincular" compacto />
              </div>
            )}
          </li>
        ))}
      </ul>

      <p className="text-sm text-suave">
        <Link href="/canales/avanzado" className="hover:text-acento">
          Crear un canal manualmente (avanzado)
        </Link>
      </p>
    </section>
  );
}
