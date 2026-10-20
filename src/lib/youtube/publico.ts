// Cliente mínimo de la API de datos de YouTube (v3) para leer datos PÚBLICOS de
// un canal con una clave de API (YOUTUBE_API_KEY). No usa cuentas ni contraseñas.
// Sin SDK y con fetch inyectable, igual que el cliente de Google.

import { reconocerCanal, type ReferenciaCanal } from "./enlace";

export type Fetch = typeof fetch;

const BASE = "https://www.googleapis.com/youtube/v3";

export class ErrorYoutube extends Error {
  constructor(
    public readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorYoutube";
  }
}

export class FaltaClaveYoutube extends Error {
  constructor() {
    super("Falta YOUTUBE_API_KEY: es la clave gratuita de la API de datos de YouTube (consola de Google Cloud).");
    this.name = "FaltaClaveYoutube";
  }
}

export class CanalNoEncontrado extends Error {
  constructor(mensaje = "No encontré ese canal. Revisa el enlace o pega el @handle.") {
    super(mensaje);
    this.name = "CanalNoEncontrado";
  }
}

export function claveYoutubeDesdeEntorno(): string | null {
  return process.env.YOUTUBE_API_KEY?.trim() || null;
}

export type CanalPublico = {
  id: string;
  titulo: string;
  handle: string | null;
  avatarUrl: string | null;
  idioma: string | null;
  suscriptores: number | null;
  vistasTotales: number | null;
  videosTotales: number | null;
  listaSubidas: string | null;
};

export type VideoPublico = {
  id: string;
  titulo: string;
  miniaturaUrl: string | null;
  publicadoEn: Date;
  duracionSeg: number | null;
  vistas: number | null;
  likes: number | null;
  comentarios: number | null;
};

type Num = string | number | undefined;
const aNumero = (v: Num): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
/** Las columnas INT de la base llegan hasta 2.147.483.647. */
const aEntero = (v: Num): number | null => {
  const n = aNumero(v);
  return n === null ? null : Math.min(Math.round(n), 2_147_483_647);
};

/** Duración ISO 8601 de YouTube (PT1H2M3S) → segundos. */
export function duracionASegundos(iso: string | undefined): number | null {
  if (!iso) return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m) return null;
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

type ItemCanal = {
  id: string;
  snippet?: { title?: string; customUrl?: string; defaultLanguage?: string; thumbnails?: Record<string, { url?: string }> };
  statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
};

function aCanal(i: ItemCanal): CanalPublico {
  const mini = i.snippet?.thumbnails;
  const custom = i.snippet?.customUrl;
  return {
    id: i.id,
    titulo: i.snippet?.title?.trim() || "Canal sin nombre",
    handle: custom?.startsWith("@") ? custom : null,
    avatarUrl: mini?.medium?.url ?? mini?.default?.url ?? mini?.high?.url ?? null,
    idioma: i.snippet?.defaultLanguage ?? null,
    suscriptores: i.statistics?.hiddenSubscriberCount ? null : aEntero(i.statistics?.subscriberCount),
    vistasTotales: aNumero(i.statistics?.viewCount),
    videosTotales: aEntero(i.statistics?.videoCount),
    listaSubidas: i.contentDetails?.relatedPlaylists?.uploads ?? null,
  };
}

export class YoutubePublico {
  constructor(
    private readonly clave: string,
    private readonly f: Fetch = fetch,
  ) {}

  private async get<T>(ruta: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${BASE}/${ruta}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("key", this.clave);
    const r = await this.f(url, { headers: { Accept: "application/json" } });
    const cuerpo = await r.text();
    if (!r.ok) {
      let detalle = cuerpo.slice(0, 300);
      let razon = "";
      try {
        const j = JSON.parse(cuerpo);
        detalle = j.error?.message ?? detalle;
        razon = j.error?.errors?.[0]?.reason ?? "";
      } catch {}
      if (razon === "quotaExceeded") throw new ErrorYoutube(r.status, "Se agotó la cuota diaria gratuita de la API de YouTube. Se renueva a medianoche (hora del Pacífico).");
      if (razon === "keyInvalid" || /API key not valid/i.test(detalle)) throw new ErrorYoutube(r.status, "La clave YOUTUBE_API_KEY no es válida.");
      throw new ErrorYoutube(r.status, `YouTube respondió ${r.status}: ${detalle}`);
    }
    return JSON.parse(cuerpo) as T;
  }

  private async canales(params: Record<string, string>): Promise<CanalPublico | null> {
    const r = await this.get<{ items?: ItemCanal[] }>("channels", { part: "snippet,statistics,contentDetails", ...params });
    return r.items?.[0] ? aCanal(r.items[0]) : null;
  }

  /** Busca el canal a partir de lo que pegó la persona (URL, @handle, id o enlace de un video). */
  async resolver(texto: string): Promise<CanalPublico> {
    const ref = reconocerCanal(texto);
    if (!ref) throw new CanalNoEncontrado("Eso no parece un enlace de YouTube. Pega la URL del canal (youtube.com/@canal) o su @handle.");
    const canal = await this.resolverReferencia(ref);
    if (!canal) throw new CanalNoEncontrado();
    return canal;
  }

  private async resolverReferencia(ref: ReferenciaCanal): Promise<CanalPublico | null> {
    switch (ref.tipo) {
      case "id":
        return this.canales({ id: ref.valor });
      case "handle":
        return this.canales({ forHandle: ref.valor });
      case "usuario":
        return (await this.canales({ forUsername: ref.valor })) ?? this.canales({ forHandle: `@${ref.valor}` });
      case "nombre": {
        // Las URL antiguas /c/nombre no tienen búsqueda directa: primero como @handle y, si no, búsqueda.
        const porHandle = await this.canales({ forHandle: `@${ref.valor}` });
        if (porHandle) return porHandle;
        const b = await this.get<{ items?: { id?: { channelId?: string } }[] }>("search", { part: "snippet", type: "channel", q: ref.valor, maxResults: "1" });
        const id = b.items?.[0]?.id?.channelId;
        return id ? this.canales({ id }) : null;
      }
      case "video": {
        const v = await this.get<{ items?: { snippet?: { channelId?: string } }[] }>("videos", { part: "snippet", id: ref.valor });
        const id = v.items?.[0]?.snippet?.channelId;
        return id ? this.canales({ id }) : null;
      }
    }
  }

  /** Totales actuales de un canal ya vinculado. */
  async totales(canalId: string): Promise<CanalPublico> {
    const c = await this.canales({ id: canalId });
    if (!c) throw new CanalNoEncontrado("YouTube ya no devuelve ese canal (¿se eliminó o cambió de id?).");
    return c;
  }

  /** Los últimos `max` videos subidos, con sus cifras públicas (50 por página). */
  async videosRecientes(listaSubidas: string, max = 50): Promise<VideoPublico[]> {
    const ids: string[] = [];
    let pagina: string | undefined;
    while (ids.length < max) {
      const r: { items?: { contentDetails?: { videoId?: string } }[]; nextPageToken?: string } = await this.get("playlistItems", {
        part: "contentDetails",
        playlistId: listaSubidas,
        maxResults: "50",
        ...(pagina ? { pageToken: pagina } : {}),
      });
      for (const i of r.items ?? []) if (i.contentDetails?.videoId) ids.push(i.contentDetails.videoId);
      if (!r.nextPageToken) break;
      pagina = r.nextPageToken;
    }
    const salida: VideoPublico[] = [];
    const unicos = [...new Set(ids)].slice(0, max);
    for (let i = 0; i < unicos.length; i += 50) {
      const r = await this.get<{
        items?: {
          id: string;
          snippet?: { title?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> };
          statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
          contentDetails?: { duration?: string };
        }[];
      }>("videos", { part: "snippet,statistics,contentDetails", id: unicos.slice(i, i + 50).join(","), maxResults: "50" });
      for (const v of r.items ?? []) {
        if (!v.snippet?.publishedAt) continue;
        const mini = v.snippet.thumbnails;
        salida.push({
          id: v.id,
          titulo: (v.snippet.title ?? "Sin título").slice(0, 300),
          miniaturaUrl: mini?.medium?.url ?? mini?.default?.url ?? null,
          publicadoEn: new Date(v.snippet.publishedAt),
          duracionSeg: duracionASegundos(v.contentDetails?.duration),
          vistas: aEntero(v.statistics?.viewCount),
          likes: aEntero(v.statistics?.likeCount),
          comentarios: aEntero(v.statistics?.commentCount),
        });
      }
    }
    return salida;
  }
}
