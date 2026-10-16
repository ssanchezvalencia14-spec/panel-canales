// Reconocimiento de enlaces de YouTube y TikTok.

export const PLATAFORMAS = ["youtube", "youtube_shorts", "tiktok"] as const;
export type Plataforma = (typeof PLATAFORMAS)[number];

export const NOMBRE_PLATAFORMA: Record<Plataforma, string> = {
  youtube: "YouTube",
  youtube_shorts: "YouTube Shorts",
  tiktok: "TikTok",
};

const RE_ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/;

/** Id de video de YouTube a partir de un enlace (watch, youtu.be, shorts, embed, live) o del id suelto. */
export function idDeYoutube(texto: string): string | null {
  const t = texto.trim();
  if (RE_ID_YOUTUBE.test(t)) return t;
  let url: URL;
  try {
    url = new URL(t.startsWith("http") ? t : `https://${t}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.searchParams.get("v") ?? /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(url.pathname)?.[1] ?? null;
  }
  return id && RE_ID_YOUTUBE.test(id) ? id : null;
}

/** Id de video de TikTok a partir de un enlace del tipo tiktok.com/@cuenta/video/123… o del id numérico. */
export function idDeTiktok(texto: string): string | null {
  const t = texto.trim();
  if (/^\d{15,22}$/.test(t)) return t;
  return /tiktok\.com\/(?:@[^/]+\/)?video\/(\d{15,22})/.exec(t)?.[1] ?? null;
}

/** Plataforma probable de un enlace y su id; los Shorts se distinguen por la ruta /shorts/. */
export function reconocerEnlace(texto: string): { plataforma: Plataforma; externoId: string } | null {
  const tiktok = idDeTiktok(texto);
  if (tiktok) return { plataforma: "tiktok", externoId: tiktok };
  const yt = idDeYoutube(texto);
  if (yt) return { plataforma: /\/shorts\//.test(texto) ? "youtube_shorts" : "youtube", externoId: yt };
  return null;
}

export function enlaceCanonico(plataforma: Plataforma, externoId: string): string {
  if (plataforma === "tiktok") return `https://www.tiktok.com/video/${externoId}`;
  if (plataforma === "youtube_shorts") return `https://www.youtube.com/shorts/${externoId}`;
  return `https://www.youtube.com/watch?v=${externoId}`;
}
