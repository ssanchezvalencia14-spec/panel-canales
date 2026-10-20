// Sección de producción asistida en la ficha de un video (servidor).

import { BotonAccion } from "./estadisticas-formularios";
import { claseCampo } from "./clases";
import { FormularioAccion } from "./formulario-accion";
import { NOMBRE_ESTADO, ESTADOS_VIDEO, type EstadoVideo } from "@/lib/dominio/estados";
import { NOMBRE_PROPIEDAD, type Propiedad, type PuntajeGancho } from "@/lib/puntaje/gancho";
import type { RevisionTitulo } from "@/lib/puntaje/titulo";
import { costoMaximo, construirPrompt, MODELO_GUION, type PedidoGuion } from "@/lib/ia/guion";
import { MARCAS, promptParaChat } from "@/lib/ia/chat";
import { Copiar } from "./confirmar-accion";
import { NOMBRE_TIPO_EJECUCION, TIPOS_EJECUCION, type Piezas } from "@/server/produccion";
import {
  actualizarEjecucionAccion,
  agregarCifraAccion,
  editarPitchAccion,
  forzarGanchoAccion,
  generarGuionAccion,
  guardarGuionAccion,
  guionDeChatAccion,
  moverEstadoAccion,
  reabrirCifraAccion,
  recalcularAccion,
  registrarEjecucionAccion,
  salidaListaAccion,
  sinCifrasAccion,
  topeVideoAccion,
  verificarCifraAccion,
} from "@/server/acciones/produccion";

type Datos = {
  slug: string;
  idioma: string;
  objetivo: number;
  piezas: Piezas;
  permisos: { edita: boolean; admin: boolean; verifica: boolean; aprueba: boolean; mueve: boolean };
  pedido: PedidoGuion;
  video: {
    id: string;
    titulo: string;
    gancho: string | null;
    textoMiniatura: string | null;
    estado: EstadoVideo;
    scoreGancho: number | null;
    puntajeGancho: unknown;
    revisionTitulo: unknown;
    ganchoForzadoEn: Date | null;
    ganchoForzadoPor: { email: string } | null;
    fuentesOk: boolean;
    limiteGasto: number | null;
  };
  cifras: { id: string; descripcion: string | null; estado: string; fuenteUrl: string | null; responsable: { email: string } | null }[];
  guiones: { id: string; version: number; contenido: string; modelo: string | null; creadoEn: Date; creadoPor: { email: string } | null }[];
  activos: { id: string; tipo: string; url: string; version: number }[];
  gasto: { gastado: number; tope: number | null };
  ejecuciones: {
    id: string;
    tipo: string;
    estado: string;
    costo: unknown;
    salidaUrl: string | null;
    log: string | null;
    creadoEn: Date;
    registradoPor: { email: string } | null;
  }[];
};

const usd = (n: number) => `US$ ${n.toFixed(2)}`;
const ESTADO_EJ: Record<string, string> = { en_cola: "En cola", en_curso: "En curso", ok: "Lista", error: "Error" };

function Seccion({ titulo, children, extra }: { titulo: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-borde bg-superficie p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="font-semibold">{titulo}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

export function ProduccionVideo(d: Datos) {
  const { video: v, permisos: p, slug } = d;
  const puntaje = (v.puntajeGancho ?? null) as PuntajeGancho | null;
  const revision = (v.revisionTitulo ?? null) as RevisionTitulo | null;
  const ganchoOk = Boolean(v.ganchoForzadoEn) || (v.scoreGancho !== null && v.scoreGancho >= d.objetivo);
  const i = ESTADOS_VIDEO.indexOf(v.estado);
  const siguiente = ESTADOS_VIDEO[i + 1];
  const anterior = i > 0 ? ESTADOS_VIDEO[i - 1] : null;
  const prompt = construirPrompt(d.pedido);
  const estimado = costoMaximo(prompt.system.length + prompt.usuario.length);
  const promptChat = promptParaChat(prompt, "guion");
  // Sin clave de API, el borrador se hace en el chat de IA del equipo.
  const conApi = Boolean(process.env.ANTHROPIC_API_KEY);
  const pendientes = d.cifras.filter((c) => c.estado !== "hecha").length;

  return (
    <div className="space-y-4">
      {/* Estado */}
      <Seccion titulo="Estado del video" extra={<span className="text-sm text-suave">Ahora: {NOMBRE_ESTADO[v.estado]}</span>}>
        {p.mueve ? (
          <div className="flex flex-wrap gap-3">
            {siguiente && (
              <FormularioAccion accion={moverEstadoAccion.bind(null, slug, v.id)} boton={`Pasar a ${NOMBRE_ESTADO[siguiente]}`} pendiente="Moviendo…">
                <input type="hidden" name="hasta" value={siguiente} />
              </FormularioAccion>
            )}
            {anterior && v.estado !== "publicado" && (
              <FormularioAccion accion={moverEstadoAccion.bind(null, slug, v.id)} boton={`Volver a ${NOMBRE_ESTADO[anterior]}`} pendiente="Moviendo…" variante="secundario">
                <input type="hidden" name="hasta" value={anterior} />
              </FormularioAccion>
            )}
          </div>
        ) : (
          <p className="text-sm text-suave">Tu rol no permite cambiar el estado.</p>
        )}
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-suave">
          <li>Gancho: {ganchoOk ? "ok" : `pendiente (objetivo ${d.objetivo})`}</li>
          <li>Fuentes: {v.fuentesOk ? "verificadas" : "pendientes"}</li>
        </ul>
      </Seccion>

      {/* Título, gancho, miniatura */}
      <Seccion
        titulo="Título, gancho y miniatura"
        extra={
          v.scoreGancho !== null && (
            <span className={`rounded-full border px-2 py-0.5 text-xs ${ganchoOk ? "border-emerald-800 text-emerald-300" : "border-amber-800 text-amber-300"}`}>
              Gancho {v.scoreGancho} / 100 · objetivo {d.objetivo}
              {v.ganchoForzadoEn && " · forzado"}
            </span>
          )
        }
      >
        {p.edita ? (
          <FormularioAccion accion={editarPitchAccion.bind(null, slug, v.id)} boton="Guardar y puntuar">
            <label className="block text-sm">
              Título
              <input name="titulo" aria-label="Título" defaultValue={v.titulo} required maxLength={300} className={`${claseCampo} mt-1`} />
            </label>
            <label className="block text-sm">
              Gancho (primera frase)
              <textarea name="gancho" aria-label="Gancho (primera frase)" defaultValue={v.gancho ?? ""} rows={2} className={`${claseCampo} mt-1`} />
            </label>
            <label className="block text-sm">
              Texto de la miniatura
              <input name="textoMiniatura" aria-label="Texto de la miniatura" defaultValue={v.textoMiniatura ?? ""} maxLength={120} className={`${claseCampo} mt-1`} />
            </label>
          </FormularioAccion>
        ) : (
          <p className="text-sm">{v.gancho ?? "Sin gancho."}</p>
        )}

        {revision && revision.banderas.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {revision.banderas.map((b) => (
              <li key={b.codigo} className={b.gravedad === "error" ? "text-red-300" : "text-amber-300"}>
                <span className="mr-2 rounded border border-current px-1 font-mono text-xs">{b.codigo}</span>
                {b.mensaje}
              </li>
            ))}
          </ul>
        )}
        {revision && revision.banderas.length === 0 && <p className="mt-3 text-sm text-emerald-300">El título pasa la revisión ({revision.longitud} caracteres).</p>}

        {puntaje && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <table className="text-sm">
              <tbody>
                {(Object.keys(puntaje.propiedades) as Propiedad[]).map((k) => (
                  <tr key={k} className="border-t border-borde first:border-t-0">
                    <td className="py-1 pr-3 text-suave">{NOMBRE_PROPIEDAD[k]}</td>
                    <td className="py-1 pr-3 tabular-nums">{puntaje.propiedades[k].puntos} / 20</td>
                    <td className="py-1 text-xs text-suave">{puntaje.propiedades[k].motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {puntaje.sugerencias.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm text-suave">
                {puntaje.sugerencias.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="mt-3 text-xs text-suave">
          Puntaje heurístico propio del panel: sirve para descartar ganchos flojos, no predice resultados.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {p.edita && <BotonAccion accion={recalcularAccion.bind(null, slug, v.id)} texto="Recalcular" pendienteTexto="Calculando…" />}
          {p.admin && v.gancho && !ganchoOk && (
            <BotonAccion
              accion={forzarGanchoAccion.bind(null, slug, v.id, true)}
              texto="Forzar gancho (admin)"
              pendienteTexto="Forzando…"
              confirmar={`El gancho tiene ${v.scoreGancho ?? 0} y el objetivo es ${d.objetivo}. ¿Dejar avanzar el video igual?`}
            />
          )}
          {p.admin && v.ganchoForzadoEn && (
            <BotonAccion accion={forzarGanchoAccion.bind(null, slug, v.id, false)} texto="Quitar forzado" pendienteTexto="Quitando…" />
          )}
        </div>
        {v.ganchoForzadoEn && <p className="mt-2 text-xs text-amber-300">Forzado por {v.ganchoForzadoPor?.email ?? "un admin"} el {v.ganchoForzadoEn.toISOString().slice(0, 10)}.</p>}
      </Seccion>

      {/* Guion */}
      <Seccion titulo="Guion" extra={<span className="text-xs text-suave">{d.guiones.length ? `${d.guiones.length} versión(es)` : "sin borrador"}</span>}>
        {p.edita && (
          <div className="mb-4 space-y-3">
            {conApi && (
              <div className="space-y-1">
                <BotonAccion accion={generarGuionAccion.bind(null, slug, v.id)} texto="Generar borrador con IA" pendienteTexto="Generando (puede tardar un minuto)…" variante="primario" />
                <p className="text-xs text-suave">
                  Modelo {MODELO_GUION}. Costo máximo estimado US$ {estimado.toFixed(2)}; queda registrado en ejecuciones. Usa las reglas de voz
                  y estructura del canal y nunca inventa cifras: las lista para verificar.
                </p>
              </div>
            )}
            <details open={!conApi} className="rounded-md border border-borde bg-fondo p-3">
              <summary className="cursor-pointer text-sm font-medium">Borrador con tu chat de IA (sin API, sin costo en el panel)</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-suave">
                <li>Copia las instrucciones: llevan la voz, la estructura y las reglas de cifras del canal.</li>
                <li>
                  Pégalas en un chat nuevo de{" "}
                  <a href="https://claude.ai/new" target="_blank" rel="noopener noreferrer" className="text-acento underline">
                    claude.ai
                  </a>{" "}
                  (o la IA que uses) y espera la respuesta completa.
                </li>
                <li>Copia toda la respuesta y pégala abajo. El panel crea la versión del guion y el checklist de cifras.</li>
              </ol>
              <div className="mt-2 flex items-center gap-2">
                <Copiar texto={promptChat} />
                <span className="text-xs text-suave">{promptChat.length.toLocaleString("es")} caracteres</span>
              </div>
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-suave">Ver las instrucciones</summary>
                <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-borde p-2 font-mono text-[11px]">{promptChat}</pre>
              </details>
              <FormularioAccion accion={guionDeChatAccion.bind(null, slug, v.id)} boton="Guardar borrador del chat" pendiente="Leyendo…" className="mt-3 space-y-2">
                <textarea
                  name="respuesta"
                  rows={8}
                  required
                  placeholder={`Pega aquí la respuesta completa (de ${MARCAS.guion} a ${MARCAS.fin})`}
                  aria-label="Respuesta del chat"
                  className={`${claseCampo} font-mono text-xs`}
                />
              </FormularioAccion>
            </details>
          </div>
        )}
        {d.guiones.map((g, n) => (
          <details key={g.id} open={n === 0} className="mb-2 rounded-md border border-borde bg-fondo p-3">
            <summary className="cursor-pointer text-sm">
              v{g.version} · {g.modelo ? `IA (${g.modelo})` : "manual"} · {g.creadoEn.toISOString().slice(0, 16).replace("T", " ")} · {g.creadoPor?.email ?? "—"}
            </summary>
            <pre className="mt-2 max-h-[32rem] overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed">{g.contenido}</pre>
          </details>
        ))}
        {p.edita && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-acento">Guardar una versión editada</summary>
            <FormularioAccion accion={guardarGuionAccion.bind(null, slug, v.id)} boton="Guardar versión" className="mt-2 space-y-2">
              <textarea name="contenido" rows={14} defaultValue={d.guiones[0]?.contenido ?? ""} className={`${claseCampo} font-mono text-xs`} aria-label="Guion" />
            </FormularioAccion>
          </details>
        )}
      </Seccion>

      {/* Cifras */}
      <Seccion
        titulo="Verificación de cifras"
        extra={
          <span className={`text-xs ${v.fuentesOk ? "text-emerald-300" : "text-amber-300"}`}>
            {d.cifras.length === 0 ? (v.fuentesOk ? "Sin cifras que verificar" : "Sin checklist") : `${d.cifras.length - pendientes} de ${d.cifras.length} con fuente`}
          </span>
        }
      >
        <p className="mb-3 text-xs text-suave">
          Toda cifra sobre personas o empresas reales necesita una fuente (enlace) antes de pasar a Producción.
        </p>
        <ul className="space-y-3">
          {d.cifras.map((c) => (
            <li key={c.id} className="rounded-md border border-borde bg-fondo p-3 text-sm">
              <p className="whitespace-pre-wrap">{c.descripcion}</p>
              {c.estado === "hecha" ? (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-emerald-300">Verificada</span>
                  {c.fuenteUrl && (
                    <a href={c.fuenteUrl} target="_blank" rel="noopener noreferrer" className="truncate text-acento underline">
                      {c.fuenteUrl}
                    </a>
                  )}
                  <span className="text-suave">{c.responsable?.email}</span>
                  {p.verifica && <BotonAccion accion={reabrirCifraAccion.bind(null, slug, c.id)} texto="Reabrir" pendienteTexto="…" />}
                </div>
              ) : (
                p.verifica && (
                  <FormularioAccion accion={verificarCifraAccion.bind(null, slug, c.id)} boton="Marcar verificada" className="mt-2 space-y-2">
                    <input name="fuente" type="url" required placeholder="https://fuente…" aria-label="Enlace de la fuente" className={claseCampo} />
                  </FormularioAccion>
                )
              )}
            </li>
          ))}
        </ul>
        {p.edita && (
          <FormularioAccion accion={agregarCifraAccion.bind(null, slug, v.id)} boton="Agregar cifra" variante="secundario" className="mt-3 space-y-2">
            <input name="afirmacion" required placeholder="Cifra o dato a verificar" aria-label="Cifra o dato a verificar" className={claseCampo} />
          </FormularioAccion>
        )}
        {p.aprueba && d.cifras.length === 0 && !v.fuentesOk && (
          <div className="mt-3">
            <BotonAccion
              accion={sinCifrasAccion.bind(null, slug, v.id)}
              texto="Declarar sin cifras que verificar"
              pendienteTexto="…"
              confirmar="¿Confirmas que el video no menciona cifras ni datos de personas o empresas reales?"
            />
          </div>
        )}
      </Seccion>

      {/* Producción: gasto, ejecuciones, salida */}
      <Seccion
        titulo="Producción"
        extra={
          <span className="text-xs text-suave">
            Gasto {usd(d.gasto.gastado)} {d.gasto.tope !== null ? `de ${usd(d.gasto.tope)}` : "· sin tope"}
          </span>
        }
      >
        {d.gasto.tope !== null && (
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-fondo" aria-hidden>
            <div
              className={`h-full rounded-full ${d.gasto.gastado > d.gasto.tope * 0.8 ? "bg-amber-400" : "bg-acento"}`}
              style={{ width: `${Math.min(100, (d.gasto.gastado / Math.max(d.gasto.tope, 0.0001)) * 100)}%` }}
            />
          </div>
        )}
        {p.admin && (
          <FormularioAccion accion={topeVideoAccion.bind(null, slug, v.id)} boton="Guardar tope del video" variante="secundario" className="mb-4 flex flex-wrap items-end gap-2">
            <label className="text-sm">
              Tope propio de este video (USD, vacío = el del canal)
              <input name="tope" type="number" min="0" step="0.01" defaultValue={v.limiteGasto ?? ""} className={`${claseCampo} mt-1 w-40`} />
            </label>
          </FormularioAccion>
        )}

        {v.estado === "produccion" && p.edita && (
          <details className="mb-4 rounded-md border border-acento p-3" open>
            <summary className="cursor-pointer text-sm font-medium">Marcar salida lista</summary>
            <FormularioAccion accion={salidaListaAccion.bind(null, slug, v.id)} boton="Marcar salida lista" className="mt-3 space-y-3">
              <p className="text-xs text-suave">Enlaces de Google Drive de cada pieza (se renderizan fuera del panel).</p>
              {(
                [
                  ["largo", "Video largo", d.piezas.largo],
                  ["tiktok", "TikTok", d.piezas.tiktok],
                  ["shorts", "Short", d.piezas.shorts],
                ] as const
              )
                .filter(([, , n]) => n > 0)
                .map(([k, nombre, n]) => (
                  <fieldset key={k} className="space-y-1">
                    <legend className="text-sm">
                      {nombre} ({n})
                    </legend>
                    {Array.from({ length: n }, (_, j) => (
                      <input
                        key={j}
                        name={k}
                        type="url"
                        required
                        placeholder="https://drive.google.com/…"
                        aria-label={`${nombre} ${j + 1}`}
                        className={claseCampo}
                      />
                    ))}
                  </fieldset>
                ))}
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-sm">
                  Costo del render o la producción (USD, opcional)
                  <input name="costo" type="number" min="0" step="0.01" className={`${claseCampo} mt-1`} />
                </label>
                <label className="text-sm">
                  Nota (opcional)
                  <input name="nota" className={`${claseCampo} mt-1`} />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="pasarARevision" defaultChecked /> Pasar el video a Revisión
              </label>
            </FormularioAccion>
          </details>
        )}

        {d.activos.length > 0 && (
          <div className="mb-4">
            <p className="mb-1 text-sm font-medium">Archivos adjuntos</p>
            <ul className="space-y-1 text-sm">
              {d.activos.map((a) => (
                <li key={a.id} className="flex gap-2">
                  <span className="w-28 shrink-0 text-suave">
                    {a.tipo} v{a.version}
                  </span>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="truncate text-acento underline">
                    {a.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mb-1 text-sm font-medium">Ejecuciones del video</p>
        <TablaEjecuciones slug={slug} ejecuciones={d.ejecuciones} edita={p.edita} />
        {p.edita && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-acento">Registrar tarea externa (voz, imágenes, render…)</summary>
            <FormularioEjecucion slug={slug} videoId={v.id} />
          </details>
        )}
      </Seccion>
    </div>
  );
}

export function FormularioEjecucion({ slug, videoId, videos }: { slug: string; videoId: string | null; videos?: { id: string; titulo: string }[] }) {
  return (
    <FormularioAccion accion={registrarEjecucionAccion.bind(null, slug, videoId)} boton="Registrar" className="mt-2 space-y-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {videos && (
          <label className="text-sm sm:col-span-2 lg:col-span-4">
            Video
            <select name="videoId" className={`${claseCampo} mt-1`} defaultValue="">
              <option value="">(sin video, gasto del canal)</option>
              {videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.titulo}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm">
          Tipo
          <select name="tipo" className={`${claseCampo} mt-1`} defaultValue="voz">
            {TIPOS_EJECUCION.filter((t) => t !== "guion_ia" && t !== "salida_lista").map((t) => (
              <option key={t} value={t}>
                {NOMBRE_TIPO_EJECUCION[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Estado
          <select name="estado" className={`${claseCampo} mt-1`} defaultValue="en_curso">
            {Object.entries(ESTADO_EJ).map(([k, t]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Costo (USD)
          <input name="costo" type="number" min="0" step="0.0001" className={`${claseCampo} mt-1`} />
        </label>
        <label className="text-sm">
          Enlace de salida
          <input name="salidaUrl" type="url" placeholder="https://drive.google.com/…" className={`${claseCampo} mt-1`} />
        </label>
      </div>
      <label className="block text-sm">
        Log / notas
        <textarea name="log" rows={2} className={`${claseCampo} mt-1`} />
      </label>
    </FormularioAccion>
  );
}

export function TablaEjecuciones({
  slug,
  ejecuciones,
  edita,
  conVideo = false,
}: {
  slug: string;
  ejecuciones: Datos["ejecuciones"] & { video?: { id: string; titulo: string } | null }[];
  edita: boolean;
  conVideo?: boolean;
}) {
  if (ejecuciones.length === 0) return <p className="text-sm text-suave">Sin ejecuciones registradas.</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-borde">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-fondo text-suave">
          <tr>
            <th className="px-2 py-1.5 font-medium">Fecha</th>
            {conVideo && <th className="px-2 py-1.5 font-medium">Video</th>}
            <th className="px-2 py-1.5 font-medium">Tipo</th>
            <th className="px-2 py-1.5 font-medium">Estado</th>
            <th className="px-2 py-1.5 text-right font-medium">Costo</th>
            <th className="px-2 py-1.5 font-medium">Salida y log</th>
          </tr>
        </thead>
        <tbody>
          {ejecuciones.map((e) => (
            <tr key={e.id} className="border-t border-borde align-top">
              <td className="px-2 py-1.5 whitespace-nowrap text-suave">{e.creadoEn.toISOString().slice(0, 16).replace("T", " ")}</td>
              {conVideo && <td className="px-2 py-1.5">{(e as { video?: { titulo: string } | null }).video?.titulo ?? "—"}</td>}
              <td className="px-2 py-1.5">{NOMBRE_TIPO_EJECUCION[e.tipo] ?? e.tipo}</td>
              <td className={`px-2 py-1.5 ${e.estado === "error" ? "text-red-300" : e.estado === "ok" ? "text-emerald-300" : ""}`}>{ESTADO_EJ[e.estado] ?? e.estado}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{usd(Number(e.costo ?? 0))}</td>
              <td className="px-2 py-1.5">
                {e.salidaUrl && (
                  <a href={e.salidaUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-acento underline">
                    {e.salidaUrl}
                  </a>
                )}
                {e.log && (
                  <details>
                    <summary className="cursor-pointer text-xs text-suave">log · {e.registradoPor?.email ?? "sistema"}</summary>
                    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{e.log}</pre>
                  </details>
                )}
                {edita && e.tipo !== "guion_ia" && e.tipo !== "sincronizacion_google" && (e.estado === "en_cola" || e.estado === "en_curso") && (
                  <FormularioAccion accion={actualizarEjecucionAccion.bind(null, slug, e.id)} boton="Actualizar" variante="secundario" className="mt-1 flex flex-wrap items-end gap-1">
                    <select name="estado" defaultValue="ok" aria-label="Nuevo estado" className="campo px-2 py-1">
                      {Object.entries(ESTADO_EJ).map(([k, t]) => (
                        <option key={k} value={k}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <input name="costo" type="number" min="0" step="0.0001" placeholder="costo" aria-label="Costo" className="w-24 campo px-2 py-1" />
                    <input name="salidaUrl" type="url" placeholder="enlace" aria-label="Enlace de salida" className="w-40 campo px-2 py-1" />
                    <input name="nota" placeholder="nota" aria-label="Nota" className="w-32 campo px-2 py-1" />
                  </FormularioAccion>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
