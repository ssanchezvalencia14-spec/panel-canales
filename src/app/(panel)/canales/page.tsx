import Link from "next/link";
import { notFound } from "next/navigation";
import { AvatarCanal } from "@/components/avatar-canal";
import { FormularioEnlace } from "@/components/formulario-enlace";
import { colorSeguro } from "@/lib/dominio/canal-config";
import { puedeAdministrarRed } from "@/lib/dominio/roles";
import { compacto, haceCuanto } from "@/lib/formato";
import { acentoPanel } from "@/lib/panel";
import { vincularCanalAccion } from "@/server/acciones/youtube-publico";
import { prisma } from "@/server/db";
import { contarMiembrosPorCanal, listarCanales } from "@/server/acceso";
import { requireUsuario } from "@/server/sesion";

export default async function Canales() {
  const usuario = await requireUsuario();
  if (!puedeAdministrarRed(usuario)) notFound();
  const [canales, miembros] = await Promise.all([listarCanales(prisma, usuario), contarMiembrosPorCanal(prisma, usuario)]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">Canales</h1>
        <p className="mt-1 text-sm text-suave">{canales.length} canal{canales.length === 1 ? "" : "es"} en la red.</p>
      </div>

      <div className="rounded-2xl border border-primario/40 bg-superficie p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Agregar un canal</h2>
        <p className="mt-1 mb-4 text-sm text-suave">
          Pega el enlace del canal (@usuario, youtube.com/channel/UC… o el enlace de cualquiera de sus videos). No hacen falta correos ni contraseñas.
        </p>
        <FormularioEnlace accion={vincularCanalAccion} />
      </div>

      <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde">
        {canales.length === 0 && <li className="p-6 text-center text-sm text-suave">Aún no hay canales. Pega el primer enlace arriba.</li>}
        {canales.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
            <AvatarCanal nombre={c.nombre} avatarUrl={c.avatarUrl} color={colorSeguro(c.colorAcento, acentoPanel())} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {c.nombre} {c.youtubeHandle && <span className="text-xs font-normal text-suave">{c.youtubeHandle}</span>}
              </p>
              {c.youtubeCanalId ? (
                <p className="text-xs text-suave">
                  {c.suscriptores !== null ? `${compacto(c.suscriptores)} suscriptores · ` : ""}
                  actualizado {haceCuanto(c.statsActualizadasEn)}
                  {c.statsError && <span className="text-red-200"> · {c.statsError}</span>}
                </p>
              ) : (
                <p className="text-xs text-amber-200">Sin enlace de YouTube: pega el enlace para traer sus estadísticas.</p>
              )}
              {(miembros.get(c.id) ?? 0) === 0 ? (
                <p className="mt-1 text-xs text-amber-200">
                  Sin equipo: solo lo ven los superadmins.{" "}
                  <Link href={`/c/${c.slug}/equipo`} className="font-medium text-texto underline underline-offset-2">
                    Dar acceso
                  </Link>
                </p>
              ) : (
                <p className="mt-1 text-xs text-suave">
                  <Link href={`/c/${c.slug}/equipo`} className="underline-offset-2 hover:text-texto hover:underline">
                    Equipo: {miembros.get(c.id)} persona{miembros.get(c.id) === 1 ? "" : "s"}
                  </Link>
                </p>
              )}
            </div>
            {c.youtubeCanalId ? (
              <div className="flex flex-wrap gap-2">
                <Link href={`/estadisticas?canal=${encodeURIComponent(c.slug)}`} className="btn-secundario px-3 py-1.5">
                  Estadísticas
                </Link>
                <Link href={`/c/${c.slug}/integraciones`} className="btn-secundario px-3 py-1.5 text-suave">
                  Conectar Google
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
        <Link href="/canales/avanzado" className="underline underline-offset-4 hover:text-texto">
          Crear un canal manualmente (avanzado)
        </Link>
      </p>
    </section>
  );
}
