import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { cifrar } from "@/lib/cifrado";
import { puede } from "@/lib/dominio/roles";
import { ALCANCES_POR_CONEXION, configOAuthDesdeEntorno, Google, intercambiarCodigo } from "@/lib/google/cliente";
import { verificarEstado } from "@/lib/google/estado";
import { log } from "@/lib/log";
import { prisma } from "@/lib/prisma-global";
import { urlPublica } from "@/lib/url";
import { cargarUsuario } from "@/server/acceso";

// Vuelta de Google: valida el «state», guarda el refresh token cifrado de la
// conexión pedida (YouTube + Calendar, o Drive) y vuelve a integraciones.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const estado = verificarEstado(p.get("state") ?? "");
  if (!estado) return NextResponse.redirect(urlPublica("/?aviso=sin-acceso", req.url));
  const tipo = estado.tipo ?? "google";

  const canal = await prisma.canal.findUnique({ where: { id: estado.canalId }, select: { id: true, slug: true } });
  if (!canal) return NextResponse.redirect(urlPublica("/", req.url));
  const volver = (q: string) => NextResponse.redirect(urlPublica(`/c/${canal.slug}/integraciones?${q}`, req.url));

  const sesion = await auth();
  const usuario = sesion?.user?.id ? await cargarUsuario(prisma, sesion.user.id) : null;
  if (!usuario || usuario.id !== estado.userId || !puede(usuario, canal.id, "configurar_canal")) {
    return NextResponse.redirect(urlPublica("/?aviso=sin-acceso", req.url));
  }
  if (p.get("error")) return volver("error=cancelado");

  const cfg = configOAuthDesdeEntorno();
  if (!cfg) return volver("error=sin-config");
  try {
    const tokens = await intercambiarCodigo(cfg, p.get("code") ?? "");
    if (!tokens.refresh_token) return volver("error=sin-refresh");
    const concedidos = tokens.scope.split(" ");
    if (!ALCANCES_POR_CONEXION[tipo].every((a) => concedidos.includes(a))) return volver(`error=${tipo === "google_drive" ? "permisos-drive" : "permisos"}`);

    const yt = tipo === "google" ? await new Google(tokens.access_token).miCanal() : null;
    const datos = {
      refreshTokenCifrado: cifrar(tokens.refresh_token),
      alcances: tokens.scope,
      ...(tipo === "google" ? { cuenta: yt?.titulo ?? null, youtubeCanalId: yt?.id ?? null } : { cuenta: "Google Drive" }),
      conectadoPorId: usuario.id,
      ultimoError: null,
    };
    await prisma.integracion.upsert({
      where: { canalId_proveedor: { canalId: canal.id, proveedor: tipo } },
      create: { canalId: canal.id, proveedor: tipo, ...datos },
      update: datos,
    });
    return volver(tipo === "google_drive" ? "ok=drive" : "ok=conectado");
  } catch (e) {
    log.error("google_conectar_fallido", { tipo, error: e });
    if (e instanceof Error && e.message.includes("INTEGRACIONES_CLAVE")) return volver("error=clave");
    return volver("error=google");
  }
}
