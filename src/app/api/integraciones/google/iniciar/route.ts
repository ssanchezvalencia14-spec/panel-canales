import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { puede } from "@/lib/dominio/roles";
import { configOAuthDesdeEntorno, urlDeAutorizacion, type TipoConexion } from "@/lib/google/cliente";
import { firmarEstado } from "@/lib/google/estado";
import { prisma } from "@/lib/prisma-global";
import { urlPublica } from "@/lib/url";
import { cargarUsuario, obtenerCanalPorSlug } from "@/server/acceso";

// Inicia la conexión de un canal con Google. Solo admin del canal (o superadmin).
//   ?canal=<slug>             YouTube (gestión y analíticas) y Calendar
//   ?canal=<slug>&tipo=drive  Google Drive (va aparte: Google no lo deja pedir junto con YouTube)
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("canal") ?? "";
  const tipo: TipoConexion = req.nextUrl.searchParams.get("tipo") === "drive" ? "google_drive" : "google";
  const volver = (q: string) => NextResponse.redirect(urlPublica(`/c/${encodeURIComponent(slug)}/integraciones?${q}`, req.url));

  const sesion = await auth();
  const usuario = sesion?.user?.id ? await cargarUsuario(prisma, sesion.user.id) : null;
  if (!usuario) return NextResponse.redirect(urlPublica("/login", req.url));
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal || !puede(usuario, canal.id, "configurar_canal")) return NextResponse.redirect(urlPublica("/?aviso=sin-acceso", req.url));

  const cfg = configOAuthDesdeEntorno();
  if (!cfg) return volver("error=sin-config");
  const state = firmarEstado({ canalId: canal.id, userId: usuario.id, vence: Date.now() + 10 * 60_000, tipo });
  return NextResponse.redirect(urlDeAutorizacion(cfg, state, tipo));
}
