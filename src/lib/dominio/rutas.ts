// Reglas de acceso por ruta, aplicadas en el proxy (servidor) antes de renderizar.
// La capa de acceso a datos vuelve a comprobar cada lectura y escritura.

export type Requisito =
  | { tipo: "publica" }
  | { tipo: "sesion" }
  | { tipo: "superadmin" }
  | { tipo: "canal"; slug: string };

export type UsuarioDeRuta = { esSuperadmin: boolean; slugs: readonly string[] } | null;

export type Decision = "permitir" | "login" | "denegar";

export function requisitoDeRuta(pathname: string): Requisito {
  if (pathname === "/login" || pathname.startsWith("/login/") || pathname.startsWith("/api/auth/")) {
    return { tipo: "publica" };
  }
  // El cron no tiene sesión: la ruta exige su propio secreto (CRON_SECRET).
  if (pathname.startsWith("/api/cron/")) return { tipo: "publica" };
  if (pathname === "/canales" || pathname.startsWith("/canales/")) return { tipo: "superadmin" };
  const canal = /^\/c\/([^/]+)(?:\/|$)/.exec(pathname);
  if (canal) return { tipo: "canal", slug: decodeURIComponent(canal[1]) };
  return { tipo: "sesion" };
}

export function decidirAcceso(requisito: Requisito, usuario: UsuarioDeRuta): Decision {
  if (requisito.tipo === "publica") return "permitir";
  if (!usuario) return "login";
  switch (requisito.tipo) {
    case "sesion":
      return "permitir";
    case "superadmin":
      return usuario.esSuperadmin ? "permitir" : "denegar";
    case "canal":
      return usuario.esSuperadmin || usuario.slugs.includes(requisito.slug) ? "permitir" : "denegar";
  }
}
