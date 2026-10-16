import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonAccion, FormularioCalendario } from "@/components/estadisticas-formularios";
import { puede } from "@/lib/dominio/roles";
import { configOAuthDesdeEntorno } from "@/lib/google/cliente";
import { prisma } from "@/server/db";
import { obtenerCanalPorSlug } from "@/server/acceso";
import { cambiarCalendarioAccion, desconectarAccion, sincronizarAccion } from "@/server/acciones/integraciones";
import { integracionDeCanal } from "@/server/metricas";
import { requireUsuario } from "@/server/sesion";

const ERRORES: Record<string, string> = {
  "sin-config": "Falta configurar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el servidor.",
  cancelado: "La conexión se canceló en Google.",
  "sin-refresh": "Google no entregó un permiso permanente. Quita el acceso del panel en tu cuenta de Google y vuelve a conectar.",
  permisos: "Faltan permisos: hay que aceptar YouTube (lectura y analíticas) y Calendar.",
  google: "Google rechazó la conexión. Inténtalo de nuevo en unos minutos.",
};

export default async function Integraciones({ params, searchParams }: PageProps<"/c/[slug]/integraciones">) {
  const { slug } = await params;
  const { ok, error } = await searchParams;
  const usuario = await requireUsuario();
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal) notFound();

  const integ = await integracionDeCanal(prisma, usuario, canal.id);
  const admin = puede(usuario, canal.id, "configurar_canal");
  const configurado = Boolean(configOAuthDesdeEntorno());

  return (
    <section className="max-w-3xl space-y-4">
      <Link href={`/c/${canal.slug}/estadisticas`} className="text-sm text-suave hover:text-texto">
        ← Estadísticas
      </Link>
      <h2 className="text-lg font-semibold">Google: YouTube y Calendar</h2>
      {ok === "conectado" && <p className="rounded-md border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">Google conectado.</p>}
      {typeof error === "string" && (
        <p role="alert" className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          {ERRORES[error] ?? "No se pudo conectar con Google."}
        </p>
      )}

      <div className="rounded-lg border border-borde bg-superficie p-4 text-sm">
        <p className="text-suave">
          Con Google conectado, el panel trae de YouTube Analytics las vistas, la retención, los likes, comentarios,
          compartidos y suscriptores de cada video, y escribe en Google Calendar las fechas de publicación y producción,
          además de leer las reuniones del calendario. El CTR de impresiones no está en la API de YouTube: se carga con el
          CSV de YouTube Studio.
        </p>

        {integ ? (
          <dl className="mt-4 grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-suave">Canal de YouTube</dt>
              <dd>{integ.cuenta ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-suave">Conectado por</dt>
              <dd>{integ.conectadoPor?.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-suave">Última sincronización</dt>
              <dd>{integ.ultimaSincronizacion ? `${integ.ultimaSincronizacion.toISOString().slice(0, 16).replace("T", " ")} UTC` : "Nunca"}</dd>
            </div>
            <div>
              <dt className="text-suave">Calendario</dt>
              <dd className="break-all">{integ.calendarioId}</dd>
            </div>
            {integ.ultimoError && (
              <div className="sm:col-span-2">
                <dt className="text-suave">Último error</dt>
                <dd className="text-red-300">{integ.ultimoError}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="mt-4">Este canal no tiene Google conectado.</p>
        )}
      </div>

      {admin ? (
        <div className="space-y-4">
          {!configurado && (
            <p className="text-sm text-amber-300">
              El servidor aún no tiene credenciales de Google (GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET). Ver el README.
            </p>
          )}
          <div className="flex flex-wrap items-start gap-3">
            <a
              href={`/api/integraciones/google/iniciar?canal=${encodeURIComponent(canal.slug)}`}
              className={`rounded-md px-3 py-2 text-sm font-semibold ${configurado ? "bg-acento text-fondo" : "pointer-events-none border border-borde text-suave"}`}
              aria-disabled={!configurado}
            >
              {integ ? "Volver a conectar" : "Conectar con Google"}
            </a>
            {integ && (
              <>
                <BotonAccion accion={sincronizarAccion.bind(null, canal.slug)} texto="Sincronizar ahora" pendienteTexto="Sincronizando…" />
                <BotonAccion
                  accion={desconectarAccion.bind(null, canal.slug)}
                  texto="Desconectar"
                  pendienteTexto="Desconectando…"
                  confirmar="¿Desconectar Google de este canal? Las métricas ya guardadas se conservan."
                />
              </>
            )}
          </div>
          {integ && (
            <div className="rounded-lg border border-borde p-4">
              <p className="mb-2 text-sm font-medium">Calendario de Google del canal</p>
              <p className="mb-2 text-xs text-suave">«primary» es el calendario principal de la cuenta. Para otro, pega su id (Configuración del calendario → Integrar el calendario).</p>
              <FormularioCalendario accion={cambiarCalendarioAccion.bind(null, canal.slug)} actual={integ.calendarioId} />
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-suave">Solo un admin del canal puede conectar o sincronizar Google.</p>
      )}
    </section>
  );
}
