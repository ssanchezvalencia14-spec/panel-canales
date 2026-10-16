// Reglas de alertas del canal. Puras: reciben los videos y el momento, y
// devuelven la lista de alertas que deberían estar abiertas.
//  - atrasado_produccion: llegó el día de producción (N días antes) y el
//    video todavía no está en Producción.
//  - atrasado_publicacion: pasó la fecha de publicación y no está programado
//    ni publicado.
//  - colchon: hay menos videos listos (aprobados o programados, por publicar)
//    que el mínimo del canal.
//  - cifras_sin_verificar: hay cifras pendientes en un video que se publica
//    pronto o que ya está en Producción o después.

import { ESTADOS_VIDEO, NOMBRE_ESTADO, type EstadoVideo } from "@/lib/dominio/estados";
import { sumarDias } from "@/lib/dominio/calendario";
import { fechaLocal } from "@/lib/dominio/fechas";

export type TipoAlerta = "atrasado_produccion" | "atrasado_publicacion" | "colchon" | "cifras_sin_verificar";

export type AlertaCalculada = {
  tipo: TipoAlerta;
  clave: string;
  videoId: string | null;
  mensaje: string;
  gravedad: "aviso" | "grave";
};

export type VideoParaAlertas = {
  id: string;
  titulo: string;
  estado: EstadoVideo;
  fechaPublicacion: Date | null;
  cifrasPendientes: number;
  fuentesOk: boolean;
};

export type ReglasAlertas = { diasProduccion: number; colchonMinimo: number; diasAvisoCifras: number };

export function reglasDeAlertas(reglas: unknown): Omit<ReglasAlertas, "diasProduccion"> {
  const r = (reglas as { colchonMinimo?: unknown; diasAvisoCifras?: unknown } | null) ?? {};
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : d);
  return { colchonMinimo: n(r.colchonMinimo, 2), diasAvisoCifras: n(r.diasAvisoCifras, 7) };
}

const i = (e: EstadoVideo) => ESTADOS_VIDEO.indexOf(e);

export function evaluarAlertas(videos: readonly VideoParaAlertas[], ahora: Date, zona: string, reglas: ReglasAlertas): AlertaCalculada[] {
  const hoy = fechaLocal(ahora, zona);
  const alertas: AlertaCalculada[] = [];

  for (const v of videos) {
    if (!v.fechaPublicacion || v.estado === "publicado") continue;
    const diaPub = fechaLocal(v.fechaPublicacion, zona);
    const diaProd = sumarDias(diaPub, -reglas.diasProduccion);

    if (v.fechaPublicacion <= ahora && i(v.estado) < i("programado")) {
      alertas.push({
        tipo: "atrasado_publicacion",
        clave: `atrasado_publicacion:${v.id}`,
        videoId: v.id,
        gravedad: "grave",
        mensaje: `«${v.titulo}» debía publicarse el ${diaPub} y sigue en ${NOMBRE_ESTADO[v.estado]}.`,
      });
    } else if (diaProd <= hoy && i(v.estado) < i("produccion")) {
      alertas.push({
        tipo: "atrasado_produccion",
        clave: `atrasado_produccion:${v.id}`,
        videoId: v.id,
        gravedad: "aviso",
        mensaje: `«${v.titulo}» debía entrar a Producción el ${diaProd} y sigue en ${NOMBRE_ESTADO[v.estado]}.`,
      });
    }

    const pronto = sumarDias(hoy, reglas.diasAvisoCifras) >= diaPub;
    const avanzado = i(v.estado) >= i("produccion");
    if ((v.cifrasPendientes > 0 && (pronto || avanzado)) || (avanzado && !v.fuentesOk)) {
      alertas.push({
        tipo: "cifras_sin_verificar",
        clave: `cifras_sin_verificar:${v.id}`,
        videoId: v.id,
        gravedad: avanzado ? "grave" : "aviso",
        mensaje:
          v.cifrasPendientes > 0
            ? `«${v.titulo}» tiene ${v.cifrasPendientes} cifra(s) sin fuente y se publica el ${diaPub}.`
            : `«${v.titulo}» está en ${NOMBRE_ESTADO[v.estado]} sin fuentes verificadas.`,
      });
    }
  }

  const listos = videos.filter(
    (v) => (v.estado === "aprobado" || v.estado === "programado") && v.fechaPublicacion && v.fechaPublicacion > ahora,
  ).length;
  if (listos < reglas.colchonMinimo) {
    alertas.push({
      tipo: "colchon",
      clave: "colchon",
      videoId: null,
      gravedad: listos === 0 ? "grave" : "aviso",
      mensaje: `Solo hay ${listos} video(s) listos para publicar; el mínimo del canal es ${reglas.colchonMinimo}.`,
    });
  }
  return alertas;
}
