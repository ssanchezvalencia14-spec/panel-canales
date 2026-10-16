import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { puede } from "@/lib/dominio/roles";
import { configOAuthDesdeEntorno, urlDeAutorizacion } from "@/lib/google/cliente";
import { firmarEstado } from "@/lib/google/estado";
import { prisma } from "@/lib/prisma-global";
import { cargarUsuario, obtenerCanalPorSlug } from "@/server/acceso";

// Inicia la conexión de un canal con Google. Solo admin del canal (o superadmin).
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("canal") ?? "";
  const volver = (q: string) => NextResponse.redirect(new URL(`/c/${encodeURIComponent(slug)}/integraciones?${q}`, req.url));

  const sesion = await auth();
  const usuario = sesion?.user?.id ? await cargarUsuario(prisma, sesion.user.id) : null;
  if (!usuario) return NextResponse.redirect(new URL("/login", req.url));
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal || !puede(usuario, canal.id, "configurar_canal")) return NextResponse.redirect(new URL("/?aviso=sin-acceso", req.url));

  const cfg = configOAuthDesdeEntorno();
  if (!cfg) return volver("error=sin-config");
  const state = firmarEstado({ canalId: canal.id, userId: usuario.id, vence: Date.now() + 10 * 60_000 });
  return NextResponse.redirect(urlDeAutorizacion(cfg, state));
}
