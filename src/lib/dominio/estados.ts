// Flujo de estados de un video y reglas de transición.
// Regla 1 del plan: nada se publica sin aprobación humana firmada.
// Regla 2: no se pasa a producción sin las cifras verificadas con fuente.

import { rolPuede, type RolEfectivo } from "./roles";

export const ESTADOS_VIDEO = [
  "idea",
  "guion",
  "verificacion",
  "produccion",
  "revision",
  "aprobado",
  "programado",
  "publicado",
] as const;
export type EstadoVideo = (typeof ESTADOS_VIDEO)[number];

export const NOMBRE_ESTADO: Record<EstadoVideo, string> = {
  idea: "Idea",
  guion: "Guion",
  verificacion: "Verificación",
  produccion: "Producción",
  revision: "Revisión",
  aprobado: "Aprobado",
  programado: "Programado",
  publicado: "Publicado",
};

const indice = (e: EstadoVideo) => ESTADOS_VIDEO.indexOf(e);

/** Estados que exigen una aprobación humana firmada en el video. */
export const ESTADOS_CON_APROBACION: readonly EstadoVideo[] = [
  "aprobado",
  "programado",
  "publicado",
];

export type ContextoTransicion = {
  desde: EstadoVideo;
  hasta: EstadoVideo;
  rol: RolEfectivo | null;
  fuentesOk: boolean;
  /** El video tiene firma de aprobación (aprobado_por + aprobado_en). */
  aprobado: boolean;
};

export type ResultadoTransicion = { ok: true } | { ok: false; motivo: string };

const no = (motivo: string): ResultadoTransicion => ({ ok: false, motivo });

export function validarTransicion(ctx: ContextoTransicion): ResultadoTransicion {
  const { desde, hasta, rol } = ctx;

  if (!rolPuede(rol, "mover_estado")) {
    return no("Tu rol no permite cambiar el estado de los videos.");
  }
  if (desde === hasta) return no("El video ya está en ese estado.");

  const salto = indice(hasta) - indice(desde);

  if (salto < 0) {
    if (desde === "publicado") {
      return no("Un video publicado no puede volver a un estado anterior.");
    }
    // Retroceder siempre es seguro (si sale de aprobado, se retira la firma).
    // Pero sacar un video ya programado exige permiso de publicación.
    if (desde === "programado" && !rolPuede(rol, "publicar")) {
      return no("Solo quien puede publicar puede desprogramar un video.");
    }
    return { ok: true };
  }

  if (salto > 1) {
    return no(
      `No se pueden saltar estados: el siguiente paso después de «${NOMBRE_ESTADO[desde]}» es «${NOMBRE_ESTADO[ESTADOS_VIDEO[indice(desde) + 1]]}».`,
    );
  }

  switch (hasta) {
    case "produccion":
      if (!ctx.fuentesOk) {
        return no(
          "Faltan cifras por verificar con fuente. Marca las fuentes como verificadas antes de pasar a producción.",
        );
      }
      return { ok: true };
    case "aprobado":
      if (!rolPuede(rol, "aprobar")) {
        return no("Solo un revisor o admin del canal puede aprobar un video.");
      }
      return { ok: true };
    case "programado":
    case "publicado":
      if (!ctx.aprobado) {
        return no("El video no tiene aprobación humana firmada.");
      }
      if (!rolPuede(rol, "publicar")) {
        return no("Solo un admin del canal puede programar o publicar.");
      }
      return { ok: true };
    default:
      return { ok: true };
  }
}

/**
 * Qué pasa con la firma de aprobación al moverse de `desde` a `hasta`:
 * se firma solo al entrar a «aprobado» desde «revisión»; se retira al volver
 * a cualquier estado anterior a «aprobado»; en otro caso se mantiene.
 */
export function efectoAprobacion(
  desde: EstadoVideo,
  hasta: EstadoVideo,
): "firmar" | "retirar" | "mantener" {
  if (hasta === "aprobado" && desde === "revision") return "firmar";
  if (!ESTADOS_CON_APROBACION.includes(hasta)) return "retirar";
  return "mantener";
}
