import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { SlugOcupado } from "@/lib/canales";
import { log, referenciaError } from "@/lib/log";
import { CanalNoEncontrado, ErrorYoutube, FaltaClaveYoutube } from "@/lib/youtube/publico";
import { AccesoDenegado, NoEncontrado, TransicionInvalida } from "../acceso";

export type Resultado = { ok?: string; error?: string } | null;

/**
 * Convierte errores esperados en un mensaje para el formulario. Los inesperados
 * se registran con una referencia y el usuario ve un mensaje genérico (sin
 * detalles internos). Las señales de Next (redirect, notFound) se relanzan.
 */
export function aResultado(e: unknown): Resultado {
  unstable_rethrow(e);
  if (
    e instanceof AccesoDenegado ||
    e instanceof NoEncontrado ||
    e instanceof TransicionInvalida ||
    e instanceof SlugOcupado ||
    e instanceof CanalNoEncontrado ||
    e instanceof FaltaClaveYoutube ||
    e instanceof ErrorYoutube
  ) {
    return { error: e.message };
  }
  if (e instanceof ZodError) {
    return { error: e.issues.map((i) => `${i.path.join(".") || "dato"}: ${i.message}`).join(" · ") };
  }
  if (e instanceof Error && e.message.startsWith("Configuración de canal inválida")) {
    return { error: e.message.replace("Configuración de canal inválida — ", "") };
  }
  const ref = referenciaError();
  log.error("accion_fallida", { ref, error: e });
  return { error: `Algo falló en el servidor (referencia ${ref}). Vuelve a intentarlo; si se repite, pásale la referencia al admin.` };
}
