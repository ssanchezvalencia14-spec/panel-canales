// Reconoce lo que la persona pega para vincular un canal de YouTube: la URL del
// canal (@handle, /channel/UC…, /c/nombre, /user/nombre), el @handle suelto, el
// id UC… o incluso el enlace de un video del canal.

export type ReferenciaCanal =
  | { tipo: "id"; valor: string }
  | { tipo: "handle"; valor: string }
  | { tipo: "usuario"; valor: string }
  | { tipo: "nombre"; valor: string }
  | { tipo: "video"; valor: string };

const RE_ID_CANAL = /^UC[A-Za-z0-9_-]{22}$/;
const RE_HANDLE = /^@?([A-Za-z0-9._À-ɏ-]{3,100})$/;
const RE_ID_VIDEO = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(["youtube.com", "youtu.be", "youtube-nocookie.com"]);

function limpiarHost(host: string): string {
  return host.toLowerCase().replace(/^(www\.|m\.|music\.)/, "");
}

/** Devuelve cómo buscar el canal, o null si el texto no parece un canal ni un video de YouTube. */
export function reconocerCanal(texto: string): ReferenciaCanal | null {
  const t = texto.trim();
  if (!t) return null;
  if (RE_ID_CANAL.test(t)) return { tipo: "id", valor: t };
  if (t.startsWith("@")) {
    const m = RE_HANDLE.exec(t);
    return m ? { tipo: "handle", valor: `@${m[1]}` } : null;
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
  const host = limpiarHost(url.hostname);
  if (!HOSTS.has(host)) return null;
  const partes = url.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));

  if (host === "youtu.be") return partes[0] && RE_ID_VIDEO.test(partes[0]) ? { tipo: "video", valor: partes[0] } : null;

  const [a, b] = partes;
  if (a?.startsWith("@")) {
    const m = RE_HANDLE.exec(a);
    return m ? { tipo: "handle", valor: `@${m[1]}` } : null;
  }
  if (a === "channel" && b && RE_ID_CANAL.test(b)) return { tipo: "id", valor: b };
  if (a === "user" && b) return { tipo: "usuario", valor: b };
  if (a === "c" && b) return { tipo: "nombre", valor: b };
  if (a === "watch") {
    const v = url.searchParams.get("v");
    return v && RE_ID_VIDEO.test(v) ? { tipo: "video", valor: v } : null;
  }
  if ((a === "shorts" || a === "live" || a === "embed") && b && RE_ID_VIDEO.test(b)) return { tipo: "video", valor: b };
  return null;
}
