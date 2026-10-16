// Proxy (antes «middleware»): aplica en el servidor las reglas de acceso por ruta
// con la sesión real de la base de datos, antes de renderizar nada.
//  - sin sesión válida            → /login
//  - /canales/*                   → solo superadmin de red
//  - /c/<slug>/*                  → miembros de ese canal (o superadmin)
// Las acciones y consultas vuelven a comprobar permisos en src/server/acceso.ts.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma-global";
import { decidirAcceso, requisitoDeRuta } from "@/lib/dominio/rutas";
import { usuarioDeSesion } from "@/server/acceso";

const COOKIES_SESION = ["__Secure-authjs.session-token", "authjs.session-token"];

export async function proxy(request: NextRequest) {
  const requisito = requisitoDeRuta(request.nextUrl.pathname);
  if (requisito.tipo === "publica") return NextResponse.next();

  const token = COOKIES_SESION.map((n) => request.cookies.get(n)?.value).find(Boolean);
  const usuario = token ? await usuarioDeSesion(prisma, token) : null;

  switch (decidirAcceso(requisito, usuario)) {
    case "permitir":
      return NextResponse.next();
    case "login":
      return NextResponse.redirect(new URL("/login", request.url));
    case "denegar":
      return NextResponse.redirect(new URL("/?aviso=sin-acceso", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
