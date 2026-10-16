"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../db";
import { NoEncontrado, obtenerCanalPorSlug } from "../acceso";
import { generarFichaEnDrive, guardarFicha, marcarPublicado, programarEnYoutube, registrarTiktokPublicado } from "../publicacion";
import { normalizarHashtag } from "@/lib/publicacion/ficha";
import { requireUsuario } from "../sesion";
import { aResultado, type Resultado } from "./resultado";

async function canalDe(slug: string) {
  const usuario = await requireUsuario();
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal) throw new NoEncontrado("Canal no disponible.");
  return { usuario, canal };
}

const refrescar = (slug: string) => revalidatePath(`/c/${slug}`, "layout");
const t = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const lista = (s: string, sep: RegExp) => s.split(sep).map((x) => x.trim()).filter(Boolean);
const confirmo = (f: FormData) => f.get("confirmo") === "si";

export async function guardarFichaAccion(slug: string, videoId: string, _p: Resultado, f: FormData): Promise<Resultado> {
  try {
    const { usuario, canal } = await canalDe(slug);
    const r = await guardarFicha(prisma, usuario, canal.id, videoId, {
      youtube: {
        titulo: t(f, "ytTitulo"),
        descripcion: String(f.get("ytDescripcion") ?? "").replace(/\r\n/g, "\n").trim(),
        etiquetas: lista(t(f, "ytEtiquetas"), /,/),
        comentarioFijado: t(f, "ytComentario"),
      },
      tiktok: {
        descripcion: t(f, "ttDescripcion"),
        hashtags: lista(t(f, "ttHashtags"), /[\s,]+/).map(normalizarHashtag).filter(Boolean),
        comentarioFijado: t(f, "ttComentario"),
      },
    });
    refrescar(slug);
    return { ok: r.avisos.length ? `Ficha guardada. Revisa: ${r.avisos.join(" ")}` : "Ficha guardada." };
  } catch (e) {
    return aResultado(e);
  }
}

export async function fichaDriveAccion(slug: string, videoId: string, prev: Resultado): Promise<Resultado> {
  void prev;
  try {
    const { usuario, canal } = await canalDe(slug);
    await generarFichaEnDrive(prisma, usuario, canal.id, videoId);
    refrescar(slug);
    return { ok: "Carpeta y ficha listas en Drive." };
  } catch (e) {
    return aResultado(e);
  }
}

export async function programarYoutubeAccion(slug: string, videoId: string, _p: Resultado, f: FormData): Promise<Resultado> {
  try {
    const { usuario, canal } = await canalDe(slug);
    const r = await programarEnYoutube(prisma, usuario, canal.id, videoId, { confirmo: confirmo(f), fechaLocal: t(f, "fecha") || null });
    refrescar(slug);
    return { ok: `Programado en YouTube para ${r.cuando}. Se avisó al equipo.` };
  } catch (e) {
    return aResultado(e);
  }
}

export async function tiktokPublicadoAccion(slug: string, videoId: string, parte: number, _p: Resultado, f: FormData): Promise<Resultado> {
  try {
    const { usuario, canal } = await canalDe(slug);
    await registrarTiktokPublicado(prisma, usuario, canal.id, videoId, { parte, enlace: t(f, "enlace"), confirmo: confirmo(f) });
    refrescar(slug);
    return { ok: `Parte ${parte} registrada. Se avisó al equipo.` };
  } catch (e) {
    return aResultado(e);
  }
}

export async function marcarPublicadoAccion(slug: string, videoId: string, _p: Resultado, f: FormData): Promise<Resultado> {
  try {
    const { usuario, canal } = await canalDe(slug);
    await marcarPublicado(prisma, usuario, canal.id, videoId, { confirmo: confirmo(f) });
    refrescar(slug);
    return { ok: "Video marcado como publicado. Se avisó al equipo." };
  } catch (e) {
    return aResultado(e);
  }
}
