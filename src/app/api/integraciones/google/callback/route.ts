import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { cifrar } from "@/lib/cifrado";
import { puede } from "@/lib/dominio/roles";
import { ALCANCES_GOOGLE, configOAuthDesdeEntorno, Google, intercambiarCodigo } from "@/lib/google/cliente";
import { verificarEstado } from "@/lib/google/estado";
import { log } from "@/lib/log";
import { prisma } from "@/lib/prisma-global";
import { cargarUsuario } from "@/server/acceso";

// Vuelta de Google: valida el «state», guarda el refresh token cifrado y
// vuelve a la página de integraciones del canal.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const estado = verificarEstado(p.get("state") ?? "");
  if (!estado) return NextResponse.redirect(new URL("/?aviso=sin-acceso", req.url));

  const canal = await prisma.canal.findUnique({ where: { id: estado.canalId }, select: { id: true, slug: true } });
  if (!canal) return NextResponse.redirect(new URL("/", req.url));
  const volver = (q: string) => NextResponse.redirect(new URL(`/c/${canal.slug}/integraciones?${q}`, req.url));

  const sesion = await auth();
  const usuario = sesion?.user?.id ? await cargarUsuario(prisma, sesion.user.id) : null;
  if (!usuario || usuario.id !== estado.userId || !puede(usuario, canal.id, "configurar_canal")) {
    return NextResponse.redirect(new URL("/?aviso=sin-acceso", req.url));
  }
  if (p.get("error")) return volver("error=cancelado");

  const cfg = configOAuthDesdeEntorno();
  if (!cfg) return volver("error=sin-config");
  try {
    const tokens = await intercambiarCodigo(cfg, p.get("code") ?? "");
    if (!tokens.refresh_token) return volver("error=sin-refresh");
    const concedidos = tokens.scope.split(" ");
    if (!ALCANCES_GOOGLE.every((a) => concedidos.includes(a))) return volver("error=permisos");

    const yt = await new Google(tokens.access_token).miCanal();
    const datos = {
      refreshTokenCifrado: cifrar(tokens.refresh_token),
      alcances: tokens.scope,
      cuenta: yt?.titulo ?? null,
      youtubeCanalId: yt?.id ?? null,
      conectadoPorId: usuario.id,
      ultimoError: null,
    };
    await prisma.integracion.upsert({
      where: { canalId_proveedor: { canalId: canal.id, proveedor: "google" } },
      create: { canalId: canal.id, proveedor: "google", ...datos },
      update: datos,
    });
    return volver("ok=conectado");
  } catch (e) {
    log.error("google_conectar_fallido", { error: e });
    return volver("error=google");
  }
}
