"use server";

import { revalidatePath } from "next/cache";
import { descifrar } from "@/lib/cifrado";
import { puede } from "@/lib/dominio/roles";
import { revocar } from "@/lib/google/cliente";
import { prisma } from "../db";
import { AccesoDenegado, NoEncontrado, obtenerCanalPorSlug } from "../acceso";
import { cambiarCalendario, desconectarGoogle } from "../metricas";
import { sincronizarCanal } from "../sincronizacion";
import { requireUsuario } from "../sesion";
import { aResultado, type Resultado } from "./resultado";

async function canalDe(slug: string) {
  const usuario = await requireUsuario();
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal) throw new NoEncontrado("Canal no disponible.");
  return { usuario, canal };
}

export async function sincronizarAccion(slug: string, prev: Resultado): Promise<Resultado> {
  void prev; // firma de useActionState
  try {
    const { usuario, canal } = await canalDe(slug);
    if (!puede(usuario, canal.id, "configurar_canal")) throw new AccesoDenegado("Solo un admin del canal puede sincronizar.");
    const r = await sincronizarCanal(prisma, canal.id);
    revalidatePath(`/c/${slug}`, "layout");
    return r.ok ? { ok: r.log.join(" ") } : { error: r.log.join(" ") };
  } catch (e) {
    return aResultado(e);
  }
}

export async function cambiarCalendarioAccion(slug: string, _p: Resultado, form: FormData): Promise<Resultado> {
  try {
    const { usuario, canal } = await canalDe(slug);
    await cambiarCalendario(prisma, usuario, canal.id, String(form.get("calendarioId") ?? ""));
    revalidatePath(`/c/${slug}/integraciones`);
    return { ok: "Calendario actualizado. Se usará en la próxima sincronización." };
  } catch (e) {
    return aResultado(e);
  }
}

export async function desconectarAccion(slug: string, prev: Resultado): Promise<Resultado> {
  void prev; // firma de useActionState
  try {
    const { usuario, canal } = await canalDe(slug);
    const cifrado = await desconectarGoogle(prisma, usuario, canal.id);
    try {
      await revocar(descifrar(cifrado));
    } catch {
      // Si no se puede revocar (clave cambiada, red), la conexión igual queda borrada del panel.
    }
    revalidatePath(`/c/${slug}`, "layout");
    return { ok: "Google desconectado. Los datos ya guardados se conservan." };
  } catch (e) {
    return aResultado(e);
  }
}
