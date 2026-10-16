"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ESTADOS_VIDEO } from "@/lib/dominio/estados";
import { generadorClaude } from "@/lib/ia/guion";
import { prisma } from "../db";
import { cambiarEstadoVideo, NoEncontrado, obtenerCanalPorSlug } from "../acceso";
import {
  actualizarEjecucion,
  agregarCifra,
  cambiarTopeCanal,
  cambiarTopeVideo,
  declararSinCifras,
  editarPitch,
  forzarGancho,
  generarBorradorGuion,
  guardarGuionManual,
  marcarSalidaLista,
  reabrirCifra,
  recalcularPuntaje,
  registrarEjecucion,
  TIPOS_EJECUCION,
  verificarCifra,
} from "../produccion";
import { requireUsuario } from "../sesion";
import { aResultado, type Resultado } from "./resultado";

async function canalDe(slug: string) {
  const usuario = await requireUsuario();
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal) throw new NoEncontrado("Canal no disponible.");
  return { usuario, canal };
}

const refrescar = (slug: string) => revalidatePath(`/c/${slug}`, "layout");
const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const numeroOpcional = (f: FormData, k: string) => {
  const t = texto(f, k).replace(",", ".");
  return t === "" ? null : Number(t);
};

export async function editarPitchAccion(slug: string, videoId: string, _p: Resultado, f: FormData): Promise<Resultado> {
  try {
    const { usuario, canal } = await canalDe(slug);
    const v = await editarPitch(prisma, usuario, canal.id, videoId, {
      titulo: texto(f, "titulo"),
      gancho: texto(f, "gancho") || null,
      textoMiniatura: texto(f, "textoMiniatura") || null,
    });
    refrescar(slug);
    return { ok: v.scoreGancho === null ? "Guardado (sin gancho no hay puntaje)." : `Guardado. Gancho: ${v.scoreGancho} / 100.` };
  } catch (e) {
    return aResultado(e);
  }
}

export async function recalcularAccion(slug: string, videoId: string, prev: Resultado): Promise<Resultado> {
  void prev;
  try {
    const { usuario, canal } = await canalDe(slug);
    const v = await recalcularPuntaje(prisma, usuario, canal.id, videoId);
    refrescar(slug);
    return { ok: v.scoreGancho === null ? "Recalculado (sin gancho)." : `Gancho: ${v.scoreGancho} / 100.` };
  } catch (e) {
    return aResultado(e);
  }
}

export async function forzarGanchoAccion(slug: string, videoId: string, forzar: boolean, prev: Resultado): Promise<Resultado> {
  void prev;
  try {
    const { usuario, canal } = await canalDe(slug);
    await forzarGancho(prisma, usuario, canal.id, videoId, forzar);
    refrescar(slug);
    return { ok: forzar ? "Gancho forzado: el video puede avanzar." : "Forzado retirado." };
  } catch (e) {
    return aResultado(e);
  }
}

export async function moverEstadoAccion(slug: string, videoId: string, _p: Resultado, f: FormData): Promise<Resultado> {
  try {
    const { usuario } = await canalDe(slug);
    const hasta = z.enum(ESTADOS_VIDEO).parse(f.get("hasta"));
    await cambiarEstadoVideo(prisma, usuario, videoId, hasta);
    refrescar(slug);
    return { ok: "Estado actualizado." };
  } catch (e) {
    return aResultado(e);
  }
}

export async function generarGuionAccion(slug: string, videoId: string, prev: Resultado): Promise<Resultado> {
  void prev;
  try {
    const { usuario, canal } = await canalDe(slug);
    const r = await generarBorradorGuion(prisma, usuario, canal.id, videoId, generadorClaude());
    refrescar(slug);
    return { ok: `Borrador v${r.guion.version} listo: ${r.cifras} cifra(s) a verificar, costo US$ ${r.costo.toFixed(4)}.` };
  } catch (e) {
    return aResultado(e);
  }
}

export async function guardarGuionAccion(slug: string, videoId: string, _p: Resultado, f: FormData): Promise<Resultado> {
  try {
    const { usuario, canal } = await canalDe(slug);
    const g = await guardarGuionManual(prisma, usuario, canal.id, videoId, String(f.get("contenido") ?? ""));
    refrescar(slug);
    return { ok: `Guardado como v${g.version}.` };
  } catch (e) {
    return aResultado(e);
  }
}

export async function agregarCifraAccion(slug: string, videoId: string, _p: Resultado, f: FormData): Promise<Resultado> {
  try {
    const { usuario, canal } = await canalDe(slug);
    await agregarCifra(prisma, usuario, canal.id, videoId, texto(f, "afirmacion"));
    refrescar(slug);
    return { ok: "Cifra agregada al checklist." };
  } catch (e) {
    return aResultado(e);
  }
}

export async function verificarCifraAccion(slug: string, tareaId: string, _p: Resultado, f: FormData): Promise<Resultado> {
  try {
    const { usuario, canal } = await canalDe(slug);
    const r = await verificarCifra(prisma, usuario, canal.id, tareaId, texto(f, "fuente"));
    refrescar(slug);
    return { ok: r.pendientes === 0 ? "Verificada. Todas las cifras tienen fuente." : `Verificada. Quedan ${r.pendientes}.` };
  } catch (e) {
    return aResultado(e);
  }
}

export async function reabrirCifraAccion(slug: string, tareaId: string, prev: Resultado): Promise<Resultado> {
  void prev;
  try {
    const { usuario, canal } = await canalDe(slug);
    await reabrirCifra(prisma, usuario, canal.id, tareaId);
    refrescar(slug);
    return { ok: "Reabierta." };
  } catch (e) {
    return aResultado(e);
  }
}

export async function sinCifrasAccion(slug: string, videoId: string, prev: Resultado): Promise<Resultado> {
  void prev;
  try {
    const { usuario, canal } = await canalDe(slug);
    await declararSinCifras(prisma, usuario, canal.id, videoId);
    refrescar(slug);
    return { ok: "Declarado sin cifras que verificar." };
  } catch (e) {
    return aResultado(e);
  }
}

export async function registrarEjecucionAccion(slug: string, videoIdFijo: string | null, _p: Resultado, f: FormData): Promise<Resultado> {
  try {
    const { usuario, canal } = await canalDe(slug);
    const tipo = z.enum(TIPOS_EJECUCION).parse(f.get("tipo"));
    const estado = z.enum(["en_cola", "en_curso", "ok", "error"]).parse(f.get("estado"));
    await registrarEjecucion(prisma, usuario, canal.id, {
      videoId: videoIdFijo ?? (texto(f, "videoId") || null),
      tipo,
      estado,
      costo: numeroOpcional(f, "costo"),
      salidaUrl: texto(f, "salidaUrl") || null,
      log: texto(f, "log") || null,
    });
    refrescar(slug);
    return { ok: "Ejecución registrada." };
  } catch (e) {
    return aResultado(e);
  }
}

export async function actualizarEjecucionAccion(slug: string, id: string, _p: Resultado, f: FormData): Promise<Resultado> {
  try {
    const { usuario, canal } = await canalDe(slug);
    await actualizarEjecucion(prisma, usuario, canal.id, id, {
      estado: z.enum(["en_cola", "en_curso", "ok", "error"]).parse(f.get("estado")),
      costo: numeroOpcional(f, "costo"),
      salidaUrl: texto(f, "salidaUrl") || null,
      nota: texto(f, "nota") || null,
    });
    refrescar(slug);
    return { ok: "Actualizada." };
  } catch (e) {
    return aResultado(e);
  }
}

export async function topeVideoAccion(slug: string, videoId: string, _p: Resultado, f: FormData): Promise<Resultado> {
  try {
    const { usuario, canal } = await canalDe(slug);
    const tope = numeroOpcional(f, "tope");
    await cambiarTopeVideo(prisma, usuario, canal.id, videoId, tope);
    refrescar(slug);
    return { ok: tope === null ? "El video usa el tope del canal." : `Tope del video: US$ ${tope.toFixed(2)}.` };
  } catch (e) {
    return aResultado(e);
  }
}

export async function topeCanalAccion(slug: string, _p: Resultado, f: FormData): Promise<Resultado> {
  try {
    const { usuario, canal } = await canalDe(slug);
    const tope = numeroOpcional(f, "tope");
    await cambiarTopeCanal(prisma, usuario, canal.id, tope);
    refrescar(slug);
    return { ok: tope === null ? "Sin tope de gasto por video." : `Tope por video: US$ ${tope.toFixed(2)}.` };
  } catch (e) {
    return aResultado(e);
  }
}

export async function salidaListaAccion(slug: string, videoId: string, _p: Resultado, f: FormData): Promise<Resultado> {
  try {
    const { usuario, canal } = await canalDe(slug);
    const enlaces = {
      largo: f.getAll("largo").map(String),
      tiktok: f.getAll("tiktok").map(String),
      shorts: f.getAll("shorts").map(String),
    };
    const r = await marcarSalidaLista(prisma, usuario, canal.id, videoId, {
      enlaces,
      costo: numeroOpcional(f, "costo"),
      nota: texto(f, "nota") || null,
      pasarARevision: f.get("pasarARevision") === "on",
    });
    refrescar(slug);
    const base = `Salida lista: ${r.activos.length} enlace(s) adjuntos y registrados en ejecuciones.`;
    if (r.transicion && !r.transicion.ok) return { ok: `${base} No pasó a Revisión: ${r.transicion.motivo}` };
    return { ok: r.transicion?.ok ? `${base} El video pasó a Revisión.` : base };
  } catch (e) {
    return aResultado(e);
  }
}
