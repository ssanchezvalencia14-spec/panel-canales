"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "../db";
import { requireUsuario } from "../sesion";
import { actualizarCanalesVisibles, vincularCanalPorEnlace } from "../youtube-publico";
import { aResultado, type Resultado } from "./resultado";

/** Pegar el enlace de un canal: crea el canal (o se lo asocia a uno existente si viene `slug`) y trae sus datos. */
export async function vincularCanalAccion(_prev: Resultado, form: FormData): Promise<Resultado> {
  let destino: string;
  try {
    const usuario = await requireUsuario();
    const enlace = String(form.get("enlace") ?? "").trim();
    if (!enlace) return { error: "Pega el enlace del canal." };
    const slugExistente = String(form.get("slug") ?? "").trim();
    const r = await vincularCanalPorEnlace(
      prisma,
      usuario,
      enlace,
      slugExistente ? { canalSlug: slugExistente } : { darAccesoEquipo: form.get("equipo") === "si" },
    );
    destino = `/estadisticas?canal=${encodeURIComponent(r.slug)}`;
  } catch (e) {
    return aResultado(e);
  }
  revalidatePath("/", "layout");
  redirect(destino);
}

/** «Actualizar ahora»: vuelve a leer los datos públicos de los canales que ve la persona. */
export async function actualizarAhoraAccion(): Promise<Resultado> {
  try {
    const usuario = await requireUsuario();
    const r = await actualizarCanalesVisibles(prisma, usuario);
    revalidatePath("/", "layout");
    const fallos = r.filter((x) => !x.ok);
    if (fallos.length > 0) return { error: fallos[0].error ?? "No se pudo actualizar." };
    return { ok: r.length === 0 ? "Los datos ya estaban al día." : `Actualizado: ${r.length} canal(es).` };
  } catch (e) {
    return aResultado(e);
  }
}
