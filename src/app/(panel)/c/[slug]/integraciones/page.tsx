import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonAccion, FormularioCalendario } from "@/components/estadisticas-formularios";
import { puede } from "@/lib/dominio/roles";
import { configOAuthDesdeEntorno } from "@/lib/google/cliente";
import { prisma } from "@/server/db";
import { obtenerCanalPorSlug } from "@/server/acceso";
import { cambiarCalendarioAccion, desconectarAccion, sincronizarAccion } from "@/server/acciones/integraciones";
import { conexionDriveDeCanal, integracionDeCanal } from "@/server/metricas";
import { requireUsuario } from "@/server/sesion";

const ERRORES: Record<string, string> = {
  "sin-config": "Falta configurar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el servidor.",
  cancelado: "La conexión se canceló en Google.",
  "sin-refresh": "Google no entregó un permiso permanente. Quita el acceso del panel en tu cuenta de Google y vuelve a conectar.",
  permisos: "Faltan permisos: hay que aceptar YouTube (gestión y analíticas) y Calendar.",
  "permisos-drive": "Falta el permiso de Google Drive: vuelve a conectar Drive y acéptalo.",
  google: "Google rechazó la conexión. Inténtalo de nuevo en unos minutos.",
};

export default async function Integraciones({ params, searchParams }: PageProps<"/c/[slug]/integraciones">) {
  const { slug } = await params;
  const { ok, error } = await searchParams;
  const usuario = await requireUsuario();
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal) notFound();

  const [integ, drive] = await Promise.all([integracionDeCanal(prisma, usuario, canal.id), conexionDriveDeCanal(prisma, usuario, canal.id)]);
  const admin = puede(usuario, canal.id, "configurar_canal");
  const configurado = Boolean(configOAuthDesdeEntorno());

  return (
    <section className="max-w-3xl space-y-4">
      <Link href={`/c/${canal.slug}/estadisticas`} className="text-sm text-suave hover:text-texto">
        ← Estadísticas
      </Link>
      <h2 className="text-lg font-semibold">Google: YouTube y Calendar</h2>
      {ok === "conectado" && (
        <p className="rounded-md border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
          YouTube y Calendar conectados.{drive ? "" : " Falta conectar Google Drive (paso 2, abajo)."}
        </p>
      )}
      {ok === "drive" && <p className="rounded-md border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">Google Drive conectado.</p>}
      {typeof error === "string" && (
        <p role="alert" className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          {ERRORES[error] ?? "No se pudo conectar con Google."}
        </p>
      )}

      <div className="rounded-lg border border-borde bg-superficie p-4 text-sm">
        <p className="text-suave">
          Con Google conectado, el panel trae de YouTube Analytics las vistas, la retención, los likes, comentarios,
          compartidos y suscriptores de cada video, y escribe en Google Calendar las fechas de publicación y producción,
          además de leer las reuniones del calendario. Con el permiso de Drive crea la carpeta y la ficha de cada video, y con el de YouTube programa la publicación. El CTR de impresiones no está en la API de YouTube: se carga con el
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
              {integ ? "Volver a conectar YouTube y Calendar" : "Paso 1 · Conectar YouTube y Calendar"}
            </a>
            {integ && (
              <>
                <BotonAccion accion={sincronizarAccion.bind(null, canal.slug)} texto="Sincronizar ahora" pendienteTexto="Sincronizando…" />
                <BotonAccion
                  accion={desconectarAccion.bind(null, canal.slug)}
                  texto="Desconectar"
                  pendienteTexto="Desconectando…"
                  confirmar="¿Desconectar Google (YouTube, Calendar y Drive) de este canal? Las métricas ya guardadas se conservan."
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
          <div className="rounded-lg border border-borde p-4 text-sm">
            <p className="mb-1 font-medium">Paso 2 · Google Drive (carpeta y ficha de cada video)</p>
            <p className="mb-3 text-xs text-suave">
              Google no deja pedir Drive junto con YouTube, así que se conecta aparte. Usa la misma cuenta de Google. El panel solo ve los archivos que él
              mismo crea.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <span className={drive ? "text-emerald-300" : "text-amber-300"}>
                {drive ? `Conectado${drive.conectadoPor ? ` por ${drive.conectadoPor.email}` : ""}` : "Sin conectar"}
              </span>
              <a
                href={`/api/integraciones/google/iniciar?canal=${encodeURIComponent(canal.slug)}&tipo=drive`}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${configurado ? (drive ? "border border-borde" : "bg-acento text-fondo") : "pointer-events-none border border-borde text-suave"}`}
                aria-disabled={!configurado}
              >
                {drive ? "Volver a conectar Drive" : "Conectar Drive"}
              </a>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-suave">Solo un admin del canal puede conectar o sincronizar Google.</p>
      )}
    </section>
  );
}
