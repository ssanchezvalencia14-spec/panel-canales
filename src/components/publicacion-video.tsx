// Sección de publicación en la ficha de un video (servidor).

import { BotonAccion } from "./estadisticas-formularios";
import { claseCampo, FormularioAccion } from "./formulario-accion";
import { ConfirmarAccion, ParteTiktok } from "./confirmar-accion";
import { ESTADOS_CON_APROBACION, type EstadoVideo } from "@/lib/dominio/estados";
import { formatearFechaHora } from "@/lib/dominio/fechas";
import type { Ficha, Revision } from "@/lib/publicacion/ficha";
import { fichaDriveAccion, guardarFichaAccion, marcarPublicadoAccion, programarYoutubeAccion, tiktokPublicadoAccion } from "@/server/acciones/publicacion";

type Props = {
  slug: string;
  canal: { zonaHoraria: string; idioma: string; horaPublicacion: string };
  permisos: { edita: boolean; publica: boolean };
  video: {
    id: string;
    titulo: string;
    estado: EstadoVideo;
    aprobadoEn: Date | null;
    driveCarpetaUrl: string | null;
    fichaDriveUrl: string | null;
    youtubeProgramadoPara: Date | null;
  };
  ficha: Ficha;
  fichaGuardada: boolean;
  revision: Revision;
  programar: { motivos: string[]; publishAt: Date | null; urlYoutube: string | null; aprobador: string | null };
  tiktok: { partes: { parte: number; descripcion: string; comentario: string }[]; checklist: string[]; publicadas: { url: string | null }[] };
  actividad: { id: string; resumen: string; creadoEn: Date; user: { email: string } | null }[];
};

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

export function PublicacionVideo(d: Props) {
  const { video: v, slug, permisos: p } = d;
  const aprobado = ESTADOS_CON_APROBACION.includes(v.estado) && Boolean(v.aprobadoEn);
  const cuando = (x: Date) => formatearFechaHora(x, d.canal.zonaHoraria, d.canal.idioma);

  return (
    <div className="space-y-4">
      <Seccion titulo="Ficha de publicación" extra={!d.fichaGuardada && <span className="text-xs text-amber-300">Borrador sin guardar</span>}>
        {p.edita ? (
          <FormularioAccion accion={guardarFichaAccion.bind(null, slug, v.id)} boton="Guardar ficha" className="space-y-3">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">YouTube</legend>
              <input name="ytTitulo" aria-label="Título de YouTube" defaultValue={d.ficha.youtube.titulo} required className={claseCampo} />
              <textarea name="ytDescripcion" aria-label="Descripción de YouTube" defaultValue={d.ficha.youtube.descripcion} rows={8} required className={`${claseCampo} font-mono text-xs`} />
              <input name="ytEtiquetas" aria-label="Etiquetas de YouTube, separadas por comas" placeholder="Etiquetas, separadas por comas" defaultValue={d.ficha.youtube.etiquetas.join(", ")} className={claseCampo} />
              <input name="ytComentario" aria-label="Comentario fijado de YouTube" placeholder="Comentario fijado" defaultValue={d.ficha.youtube.comentarioFijado} className={claseCampo} />
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">TikTok (sin enlaces: el enlace va solo en la bio)</legend>
              <input name="ttDescripcion" aria-label="Descripción de TikTok" defaultValue={d.ficha.tiktok.descripcion} required className={claseCampo} />
              <input name="ttHashtags" aria-label="Hashtags de TikTok" placeholder="#uno #dos #tres" defaultValue={d.ficha.tiktok.hashtags.join(" ")} className={claseCampo} />
              <input name="ttComentario" aria-label="Comentario fijado de TikTok" placeholder="Comentario fijado (sin enlaces)" defaultValue={d.ficha.tiktok.comentarioFijado} className={claseCampo} />
            </fieldset>
          </FormularioAccion>
        ) : (
          <p className="text-sm text-suave">Tu rol solo permite ver la ficha.</p>
        )}
        {(d.revision.errores.length > 0 || d.revision.avisos.length > 0) && (
          <ul className="mt-3 space-y-1 text-sm">
            {d.revision.errores.map((e) => (
              <li key={e} className="text-red-300">
                {e}
              </li>
            ))}
            {d.revision.avisos.map((a) => (
              <li key={a} className="text-amber-300">
                {a}
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Google Drive">
        <div className="space-y-1 text-sm">
          {v.driveCarpetaUrl ? (
            <p>
              Carpeta:{" "}
              <a href={v.driveCarpetaUrl} target="_blank" rel="noopener noreferrer" className="text-acento underline">
                abrir en Drive
              </a>
            </p>
          ) : (
            <p className="text-suave">Todavía no hay carpeta en Drive.</p>
          )}
          {v.fichaDriveUrl && (
            <p>
              Ficha:{" "}
              <a href={v.fichaDriveUrl} target="_blank" rel="noopener noreferrer" className="text-acento underline">
                abrir documento
              </a>
            </p>
          )}
        </div>
        {p.edita && (
          <div className="mt-3">
            <BotonAccion
              accion={fichaDriveAccion.bind(null, slug, v.id)}
              texto={v.fichaDriveUrl ? "Actualizar ficha en Drive" : "Crear carpeta y ficha en Drive"}
              pendienteTexto="Escribiendo en Drive…"
              variante="primario"
            />
            <p className="mt-1 text-xs text-suave">Usa la ficha guardada. El panel solo ve en Drive lo que él mismo crea.</p>
          </div>
        )}
      </Seccion>

      <Seccion
        titulo="Programar en YouTube"
        extra={v.youtubeProgramadoPara && <span className="text-xs text-emerald-300">Programado para {cuando(v.youtubeProgramadoPara)}</span>}
      >
        {v.estado === "programado" || v.estado === "publicado" ? (
          <p className="text-sm text-suave">El video ya está {v.estado === "programado" ? "programado" : "publicado"}.</p>
        ) : d.programar.motivos.length > 0 ? (
          <div className="text-sm">
            <p className="text-suave">Aún no se puede programar:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-300">
              {d.programar.motivos.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        ) : p.publica ? (
          <ConfirmarAccion
            accion={programarYoutubeAccion.bind(null, slug, v.id)}
            titulo="Vas a programar este video en YouTube"
            resumen={[
              `Título: ${d.ficha.youtube.titulo}`,
              `Se publicará solo el ${cuando(d.programar.publishAt!)} (${d.canal.zonaHoraria}).`,
              `Video: ${d.programar.urlYoutube}`,
              `Aprobado por ${d.programar.aprobador ?? "—"}.`,
              "Se actualizan título, descripción y etiquetas con la ficha; el video queda privado hasta esa hora.",
              "Queda en el registro de actividad y se avisa al equipo por correo.",
            ]}
            textoConfirmacion="Confirmo que revisé el video y la ficha, y que YouTube lo publique en esa fecha."
            boton="Programar en YouTube"
            pendiente="Programando…"
          >
            <label className="block text-sm">
              Otra fecha (opcional, se publica a las {d.canal.horaPublicacion} hora del canal)
              <input name="fecha" type="date" className={`${claseCampo} mt-1 w-48`} />
            </label>
          </ConfirmarAccion>
        ) : (
          <p className="text-sm text-suave">Solo un admin del canal puede programar.</p>
        )}
        {v.estado === "programado" && p.publica && (
          <div className="mt-3">
            <ConfirmarAccion
              accion={marcarPublicadoAccion.bind(null, slug, v.id)}
              titulo="Marcar como publicado"
              resumen={["Úsalo cuando el video ya se vea público en YouTube.", "Queda en el registro de actividad y se avisa al equipo."]}
              textoConfirmacion="Confirmo que el video ya está publicado en YouTube."
              boton="Marcar publicado"
            />
          </div>
        )}
      </Seccion>

      <Seccion
        titulo="TikTok (manual guiado)"
        extra={<span className="text-xs text-suave">{d.tiktok.publicadas.length} de {d.tiktok.partes.length} publicadas</span>}
      >
        {!aprobado ? (
          <p className="text-sm text-suave">Los textos para TikTok se habilitan cuando el video está aprobado.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-suave">Sin enlaces en la descripción ni en los comentarios: el enlace al video largo va solo en la bio.</p>
            {d.tiktok.partes.map((parte, i) => (
              <ParteTiktok
                key={parte.parte}
                parte={parte.parte}
                partes={d.tiktok.partes.length}
                descripcion={parte.descripcion}
                comentario={parte.comentario}
                checklist={d.tiktok.checklist}
                publicada={d.tiktok.publicadas[i]?.url ?? null}
                accion={tiktokPublicadoAccion.bind(null, slug, v.id, parte.parte)}
                puedeRegistrar={p.edita}
              />
            ))}
          </div>
        )}
      </Seccion>

      <Seccion titulo="Registro de actividad">
        {d.actividad.length === 0 ? (
          <p className="text-sm text-suave">Sin actividad todavía.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {d.actividad.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-3">
                <span className="text-suave tabular-nums">{a.creadoEn.toISOString().slice(0, 16).replace("T", " ")}</span>
                <span>{a.resumen}</span>
                <span className="text-xs text-suave">{a.user?.email ?? "sistema"}</span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>
    </div>
  );
}
