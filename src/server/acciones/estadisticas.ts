"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PLATAFORMAS } from "@/lib/dominio/plataformas";
import { fechaLocal } from "@/lib/dominio/fechas";
import { prisma } from "../db";
import { NoEncontrado, obtenerCanalPorSlug } from "../acceso";
import { guardarMetricaManual, importarMetricasCsv, quitarPublicacion, registrarPublicacion } from "../metricas";
import { requireUsuario } from "../sesion";
import { aResultado, type Resultado } from "./resultado";

async function canalDe(slug: string) {
  const usuario = await requireUsuario();
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal) throw new NoEncontrado("Canal no disponible.");
  return { usuario, canal };
}

const numero = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : Number(s.replace(",", "."))))
  .refine((n) => n === null || Number.isFinite(n), "número inválido");

export async function registrarPublicacionAccion(slug: string, videoId: string, _p: Resultado, form: FormData): Promise<Resultado> {
  try {
    const { usuario, canal } = await canalDe(slug);
    const datos = z
      .object({ enlace: z.string().trim().min(5, "pega el enlace"), plataforma: z.enum(PLATAFORMAS).optional(), publicada: z.string().optional() })
      .parse({
        enlace: form.get("enlace"),
        plataforma: form.get("plataforma") || undefined,
        publicada: form.get("publicada") || undefined,
      });
    await registrarPublicacion(prisma, usuario, canal.id, {
      videoId,
      enlace: datos.enlace,
      plataforma: datos.plataforma,
      publicada: datos.publicada ? new Date(`${datos.publicada}T12:00:00Z`) : null,
    });
    revalidatePath(`/c/${slug}`, "layout");
    return { ok: "Publicación registrada." };
  } catch (e) {
    return aResultado(e);
  }
}

export async function quitarPublicacionAccion(slug: string, publicacionId: string, prev: Resultado): Promise<Resultado> {
  void prev; // firma de useActionState
  try {
    const { usuario, canal } = await canalDe(slug);
    await quitarPublicacion(prisma, usuario, canal.id, publicacionId);
    revalidatePath(`/c/${slug}`, "layout");
    return { ok: "Publicación quitada." };
  } catch (e) {
    return aResultado(e);
  }
}

export async function metricaManualAccion(slug: string, publicacionId: string, _p: Resultado, form: FormData): Promise<Resultado> {
  try {
    const { usuario, canal } = await canalDe(slug);
    const v = z
      .object({
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha inválida"),
        vistas: numero,
        retencion: numero,
        ctr: numero,
        likes: numero,
        comentarios: numero,
        compartidos: numero,
        suscriptores: numero,
      })
      .parse(Object.fromEntries(["fecha", "vistas", "retencion", "ctr", "likes", "comentarios", "compartidos", "suscriptores"].map((k) => [k, String(form.get(k) ?? "")])));
    const { fecha, ...valores } = v;
    await guardarMetricaManual(prisma, usuario, canal.id, publicacionId, fecha, valores);
    revalidatePath(`/c/${slug}`, "layout");
    return { ok: `Métricas al ${fecha} guardadas.` };
  } catch (e) {
    return aResultado(e);
  }
}

export type ResultadoCsv = {
  ok?: string;
  error?: string;
  detalle?: { guardadas: number; creadas: number; sinEmparejar: string[]; avisos: string[] };
} | null;

export async function importarCsvAccion(slug: string, _p: ResultadoCsv, form: FormData): Promise<ResultadoCsv> {
  try {
    const { usuario, canal } = await canalDe(slug);
    const archivo = form.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) return { error: "Elige un archivo CSV." };
    if (archivo.size > 2_000_000) return { error: "El archivo pesa más de 2 MB." };
    const plataforma = z.enum(PLATAFORMAS).parse(form.get("plataforma"));
    const fecha = String(form.get("fecha") || fechaLocal(new Date(), canal.zonaHoraria));
    const detalle = await importarMetricasCsv(prisma, usuario, canal.id, await archivo.text(), { plataforma, fechaPorDefecto: fecha });
    revalidatePath(`/c/${slug}`, "layout");
    return {
      ok: `${detalle.guardadas} fila(s) guardadas${detalle.creadas ? `, ${detalle.creadas} publicación(es) nuevas` : ""}.`,
      detalle,
    };
  } catch (e) {
    return aResultado(e);
  }
}
