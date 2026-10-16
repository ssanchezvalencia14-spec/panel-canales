import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "./db";
import { cargarUsuario, type UsuarioSesion } from "./acceso";

/** Usuario de la sesión actual o redirección al login. Se resuelve una vez por petición. */
export const requireUsuario = cache(async (): Promise<UsuarioSesion> => {
  const sesion = await auth();
  const id = sesion?.user?.id;
  if (!id) redirect("/login");
  const usuario = await cargarUsuario(prisma, id);
  if (!usuario) redirect("/login?error=AccessDenied");
  return usuario;
});
