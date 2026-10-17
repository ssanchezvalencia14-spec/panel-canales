import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonAccion } from "@/components/estadisticas-formularios";
import { ConfirmarAccion, Copiar } from "@/components/confirmar-accion";
import { claseCampo, FormularioAccion } from "@/components/formulario-accion";
import { puede } from "@/lib/dominio/roles";
import { prisma } from "@/server/db";
import { obtenerCanalPorSlug } from "@/server/acceso";
import { enviarResumenAccion, investigacionDeChatAccion, investigarAccion, resumenAhoraAccion, revisarAlertasAccion } from "@/server/acciones/informes";
import { alertasDeCanal, listarInformes, obtenerInforme, promptInvestigacionDeChat, TIPO_RESUMEN, topeInvestigacion } from "@/server/automatizaciones";
import { requireUsuario } from "@/server/sesion";

const NOMBRE_ALERTA: Record<string, string> = {
  atrasado_produccion: "Atraso de producción",
  atrasado_publicacion: "Publicación atrasada",
  colchon: "Falta de colchón",
  cifras_sin_verificar: "Cifras sin verificar",
};
const ESTADO_INFORME: Record<string, string> = { borrador: "Borrador", enviado: "Enviado", error: "Error al enviar" };
const fecha = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

export default async function Informes({ params }: PageProps<"/c/[slug]/informes">) {
  const { slug } = await params;
  const usuario = await requireUsuario();
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal) notFound();

  const admin = puede(usuario, canal.id, "configurar_canal");
  const conApi = Boolean(process.env.ANTHROPIC_API_KEY);
  const promptChat = admin ? await promptInvestigacionDeChat(prisma, usuario, canal.id) : null;
  const [alertas, informes] = await Promise.all([
    alertasDeCanal(prisma, usuario, canal.id, 30),
    listarInformes(prisma, usuario, canal.id),
  ]);
  const abiertas = alertas.filter((a) => !a.cerradaEn);
  const cerradas = alertas.filter((a) => a.cerradaEn);
  const borrador = informes.find((i) => i.tipo === TIPO_RESUMEN && i.estado !== "enviado");
  const resumenBorrador = borrador ? await obtenerInforme(prisma, usuario, canal.id, borrador.id) : null;

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-borde bg-superficie p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">Alertas</h2>
          <span className="text-xs text-suave">{abiertas.length} abierta(s)</span>
          <div className="ml-auto">
            <BotonAccion accion={revisarAlertasAccion.bind(null, canal.slug)} texto="Revisar ahora" pendienteTexto="Revisando…" />
          </div>
        </div>
        {abiertas.length === 0 ? (
          <p className="text-sm text-emerald-300">Sin alertas abiertas.</p>
        ) : (
          <ul className="space-y-2">
            {abiertas.map((a) => (
              <li key={a.id} className={`rounded-md border p-2 text-sm ${a.gravedad === "grave" ? "border-red-900 bg-red-950/30" : "border-amber-900 bg-amber-950/20"}`}>
                <span className="mr-2 text-xs font-medium uppercase tracking-wide text-suave">{NOMBRE_ALERTA[a.tipo] ?? a.tipo}</span>
                {a.video ? (
                  <Link href={`/c/${canal.slug}/videos/${a.video.id}`} className="hover:underline">
                    {a.mensaje}
                  </Link>
                ) : (
                  a.mensaje
                )}
                <span className="ml-2 text-xs text-suave">desde {fecha(a.abiertaEn)}</span>
              </li>
            ))}
          </ul>
        )}
        {cerradas.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-suave">Historial de los últimos 30 días ({cerradas.length} cerradas)</summary>
            <ul className="mt-2 space-y-1">
              {cerradas.map((a) => (
                <li key={a.id} className="text-suave">
                  {fecha(a.abiertaEn)} → {fecha(a.cerradaEn!)} · {a.mensaje}
                </li>
              ))}
            </ul>
          </details>
        )}
        <p className="mt-3 text-xs text-suave">El cron diario revisa las alertas y avisa por correo a los admins de las nuevas.</p>
      </div>

      <div className="rounded-lg border border-borde bg-superficie p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">Resumen semanal</h2>
          {admin && (
            <div className="ml-auto">
              <BotonAccion accion={resumenAhoraAccion.bind(null, canal.slug)} texto="Generar el de esta semana" pendienteTexto="Generando…" />
            </div>
          )}
        </div>
        {resumenBorrador ? (
          admin ? (
            <ConfirmarAccion
              accion={enviarResumenAccion.bind(null, canal.slug, resumenBorrador.id)}
              titulo={`${resumenBorrador.titulo} · ${ESTADO_INFORME[resumenBorrador.estado]}`}
              resumen={["Puedes editar el texto antes de enviarlo.", "Se envía por correo a todo el equipo del canal y queda en el registro de actividad."]}
              textoConfirmacion="Confirmo que revisé el resumen y que se envíe al equipo."
              boton="Aprobar y enviar"
              pendiente="Enviando…"
            >
              <textarea name="contenido" defaultValue={resumenBorrador.contenido} rows={18} aria-label="Texto del resumen" className={`${claseCampo} font-mono text-xs`} />
            </ConfirmarAccion>
          ) : (
            <p className="text-sm text-suave">Hay un resumen en borrador esperando la aprobación de un admin.</p>
          )
        ) : (
          <p className="text-sm text-suave">No hay resumen pendiente. El cron semanal genera el borrador y avisa a los admins.</p>
        )}
      </div>

      <div className="rounded-lg border border-borde bg-superficie p-4">
        <h2 className="mb-1 font-semibold">Investigación de referencias</h2>
        <p className="mb-3 text-xs text-suave">
          Un informe semanal con referencias y tendencias del nicho, siempre con enlaces. vidIQ no tiene API para el panel: lo que exportes de vidIQ
          se usa como insumo.
        </p>
        {admin && conApi && (
          <FormularioAccion accion={investigarAccion.bind(null, canal.slug)} boton="Investigar ahora con la API" pendiente="Investigando (puede tardar unos minutos)…" className="mb-3 space-y-2">
            <p className="text-xs text-suave">Con la API de Claude y búsqueda web. Tope por informe: US$ {topeInvestigacion(canal.reglas).toFixed(2)}.</p>
            <textarea name="vidiq" rows={4} placeholder="Opcional: datos de vidIQ (outliers, palabras clave…)" aria-label="Datos de vidIQ" className={`${claseCampo} font-mono text-xs`} />
          </FormularioAccion>
        )}
        {admin && promptChat && (
          <details open={!conApi} className="rounded-md border border-borde bg-fondo p-3">
            <summary className="cursor-pointer text-sm font-medium">Investigar con tu chat de IA (sin API, sin costo en el panel)</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-suave">
              <li>Copia las instrucciones y pégalas en un chat nuevo de claude.ai con la búsqueda web activada (o la IA que uses).</li>
              <li>Si tienes datos de vidIQ, pégalos en el mismo mensaje, debajo de las instrucciones.</li>
              <li>Copia el informe completo y pégalo abajo. Se guarda como la investigación de esta semana.</li>
            </ol>
            <div className="mt-2 flex items-center gap-2">
              <Copiar texto={promptChat} />
              <a href="https://claude.ai/new" target="_blank" rel="noopener noreferrer" className="text-xs text-acento underline">
                Abrir claude.ai
              </a>
            </div>
            <FormularioAccion accion={investigacionDeChatAccion.bind(null, canal.slug)} boton="Guardar informe del chat" pendiente="Guardando…" className="mt-3 space-y-2">
              <textarea name="informe" rows={8} required placeholder="Pega aquí el informe completo, con sus enlaces" aria-label="Informe del chat" className={`${claseCampo} font-mono text-xs`} />
            </FormularioAccion>
          </details>
        )}
      </div>

      <div className="rounded-lg border border-borde">
        <h2 className="border-b border-borde bg-superficie px-3 py-2 font-semibold">Informes</h2>
        {informes.length === 0 ? (
          <p className="p-3 text-sm text-suave">Todavía no hay informes.</p>
        ) : (
          <ul>
            {informes.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 border-t border-borde px-3 py-2 text-sm first:border-t-0">
                <Link href={`/c/${canal.slug}/informes/${i.id}`} className="font-medium hover:text-acento hover:underline">
                  {i.titulo}
                </Link>
                <span className="text-xs text-suave">{ESTADO_INFORME[i.estado]}</span>
                {i.costo !== null && Number(i.costo) > 0 && <span className="text-xs text-suave">US$ {Number(i.costo).toFixed(4)}</span>}
                <span className="ml-auto text-xs text-suave">{fecha(i.creadoEn)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
