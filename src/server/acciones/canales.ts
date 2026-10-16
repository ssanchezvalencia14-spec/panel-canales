"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { validarConfigCanal } from "@/lib/canales";
import { aSlug } from "@/lib/dominio/canal-config";
import { prisma } from "../db";
import { crearCanal } from "../acceso";
import { requireUsuario } from "../sesion";
import { aResultado, type Resultado } from "./resultado";

function lineas(valor: FormDataEntryValue | null): string[] {
  return String(valor ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export async function crearCanalAccion(_prev: Resultado, form: FormData): Promise<Resultado> {
  let slug: string;
  try {
    const usuario = await requireUsuario();
    const nombre = String(form.get("nombre") ?? "").trim();
    slug = String(form.get("slug") ?? "").trim() || aSlug(nombre);

    let reglas: unknown = {};
    const reglasTexto = String(form.get("reglas") ?? "").trim();
    if (reglasTexto) {
      try {
        reglas = JSON.parse(reglasTexto);
      } catch {
        return { error: "reglas: no es un JSON válido." };
      }
    }
    const limite = String(form.get("limiteGastoVideo") ?? "").trim();

    const config = validarConfigCanal({
      slug,
      nombre,
      idioma: String(form.get("idioma") ?? "es").trim(),
      zonaHoraria: String(form.get("zonaHoraria") ?? "").trim(),
      horaPublicacion: String(form.get("horaPublicacion") ?? "").trim(),
      diasPublicacion: form.getAll("diasPublicacion").map(String),
      colorAcento: String(form.get("colorAcento") ?? "").trim(),
      pilares: lineas(form.get("pilares")),
      reglas,
      limiteGastoVideo: limite ? Number(limite) : null,
    });
    await crearCanal(prisma, usuario, config);
  } catch (e) {
    return aResultado(e);
  }
  revalidatePath("/", "layout");
  redirect(`/c/${slug}/calendario`);
}
