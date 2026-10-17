"use server";

import { revalidatePath } from "next/cache";
import { investigadorClaude } from "@/lib/ia/investigacion";
import { prisma } from "../db";
import { NoEncontrado, obtenerCanalPorSlug } from "../acceso";
import { aprobarYEnviarResumen, importarInvestigacionDeChat, investigarAhora, resumenAhora, sincronizarAlertas } from "../automatizaciones";
import { requireUsuario } from "../sesion";
import { aResultado, type Resultado } from "./resultado";
import { puede } from "@/lib/dominio/roles";

async function canalDe(slug: string) {
  const usuario = await requireUsuario();
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal) throw new NoEncontrado("Canal no disponible.");
  return { usuario, canal };
}

const refrescar = (slug: string) => revalidatePath(`/c/${slug}`, "layout");

export async function revisarAlertasAccion(slug: string, prev: Resultado): Promise<Resultado> {
  void prev;
  try {
    const { usuario, canal } = await canalDe(slug);
    if (!puede(usuario, canal.id, "ver")) throw new NoEncontrado("Canal no disponible.");
    const r = await sincronizarAlertas(prisma, canal.id);
    refrescar(slug);
    return { ok: `${r.abiertas} abierta(s): ${r.nuevas} nueva(s), ${r.cerradas} cerrada(s).` };
  } catch (e) {
    return aResultado(e);
  }
}

export async function resumenAhoraAccion(slug: string, prev: Resultado): Promise<Resultado> {
  void prev;
  try {
    const { usuario, canal } = await canalDe(slug);
    const r = await resumenAhora(prisma, usuario, canal.id);
    refrescar(slug);
    return { ok: r.estado === "enviado" ? "El resumen de esta semana ya se envió." : `${r.titulo} en borrador: revísalo abajo.` };
  } catch (e) {
    return aResultado(e);
  }
}

export async function investigarAccion(slug: string, _p: Resultado, f: FormData): Promise<Resultado> {
  try {
    const { usuario, canal } = await canalDe(slug);
    const r = await investigarAhora(prisma, usuario, canal.id, investigadorClaude(), String(f.get("vidiq") ?? "") || null);
    refrescar(slug);
    return { ok: `${r.titulo} lista (US$ ${Number(r.costo ?? 0).toFixed(4)}).` };
  } catch (e) {
    return aResultado(e);
  }
}

export async function investigacionDeChatAccion(slug: string, _p: Resultado, f: FormData): Promise<Resultado> {
  try {
    const { usuario, canal } = await canalDe(slug);
    const r = await importarInvestigacionDeChat(prisma, usuario, canal.id, String(f.get("informe") ?? ""));
    refrescar(slug);
    return { ok: `${r.titulo} guardada desde el chat.` };
  } catch (e) {
    return aResultado(e);
  }
}

export async function enviarResumenAccion(slug: string, informeId: string, _p: Resultado, f: FormData): Promise<Resultado> {
  try {
    const { usuario, canal } = await canalDe(slug);
    await aprobarYEnviarResumen(prisma, usuario, canal.id, informeId, { contenido: String(f.get("contenido") ?? ""), confirmo: f.get("confirmo") === "si" });
    refrescar(slug);
    return { ok: "Resumen aprobado y enviado al equipo." };
  } catch (e) {
    return aResultado(e);
  }
}
