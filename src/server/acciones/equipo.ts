"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ROLES } from "@/lib/dominio/roles";
import { prisma } from "../db";
import { agregarMiembro, cambiarRolMiembro, NoEncontrado, obtenerCanalPorSlug, quitarMiembro } from "../acceso";
import { requireUsuario } from "../sesion";
import { aResultado, type Resultado } from "./resultado";

async function canalDe(slug: string) {
  const usuario = await requireUsuario();
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal) throw new NoEncontrado("Canal no disponible.");
  return { usuario, canal };
}

const esquemaAlta = z.object({
  email: z.string().trim().toLowerCase().email("correo inválido"),
  nombre: z.string().trim().max(120).optional(),
  rol: z.enum(ROLES),
});

export async function agregarMiembroAccion(slug: string, _prev: Resultado, form: FormData): Promise<Resultado> {
  try {
    const { usuario, canal } = await canalDe(slug);
    const datos = esquemaAlta.parse({
      email: form.get("email"),
      nombre: form.get("nombre") || undefined,
      rol: form.get("rol"),
    });
    await agregarMiembro(prisma, usuario, canal.id, datos);
    revalidatePath(`/c/${slug}/equipo`);
    return { ok: `${datos.email} ahora es ${datos.rol} del canal.` };
  } catch (e) {
    return aResultado(e);
  }
}

export async function cambiarRolAccion(slug: string, userId: string, _prev: Resultado, form: FormData): Promise<Resultado> {
  try {
    const { usuario, canal } = await canalDe(slug);
    const rol = z.enum(ROLES).parse(form.get("rol"));
    await cambiarRolMiembro(prisma, usuario, canal.id, userId, rol);
    revalidatePath(`/c/${slug}/equipo`);
    return { ok: "Rol actualizado." };
  } catch (e) {
    return aResultado(e);
  }
}

export async function quitarMiembroAccion(slug: string, userId: string, prev: Resultado): Promise<Resultado> {
  void prev; // firma de useActionState
  try {
    const { usuario, canal } = await canalDe(slug);
    await quitarMiembro(prisma, usuario, canal.id, userId);
    revalidatePath(`/c/${slug}/equipo`);
    return { ok: "Acceso retirado." };
  } catch (e) {
    return aResultado(e);
  }
}
