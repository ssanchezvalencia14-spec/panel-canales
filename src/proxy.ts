// Comprobación optimista: sin cookie de sesión, al login. La autorización real
// (usuario activo, rol por canal) se hace en el servidor, en la capa de acceso.

import { NextResponse, type NextRequest } from "next/server";

const COOKIES_SESION = ["authjs.session-token", "__Secure-authjs.session-token"];

export function proxy(request: NextRequest) {
  const tieneSesion = COOKIES_SESION.some((n) => request.cookies.has(n));
  if (!tieneSesion) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
