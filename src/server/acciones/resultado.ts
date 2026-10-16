import { ZodError } from "zod";
import { SlugOcupado } from "@/lib/canales";
import { AccesoDenegado, NoEncontrado, TransicionInvalida } from "../acceso";

export type Resultado = { ok?: string; error?: string } | null;

/** Convierte errores esperados en un mensaje para el formulario; el resto se relanza. */
export function aResultado(e: unknown): Resultado {
  if (e instanceof AccesoDenegado || e instanceof NoEncontrado || e instanceof TransicionInvalida || e instanceof SlugOcupado) {
    return { error: e.message };
  }
  if (e instanceof ZodError) {
    return { error: e.issues.map((i) => `${i.path.join(".") || "dato"}: ${i.message}`).join(" · ") };
  }
  if (e instanceof Error && e.message.startsWith("Configuración de canal inválida")) {
    return { error: e.message.replace("Configuración de canal inválida — ", "") };
  }
  throw e;
}
