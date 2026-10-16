// Cliente mínimo de las APIs de Google que usa el panel, sobre fetch.
// Sin SDK: menos dependencias en el hosting y fácil de probar (fetch inyectable).

export type Fetch = typeof fetch;

export const ALCANCES_GOOGLE = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

export class ErrorGoogle extends Error {
  constructor(
    public readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorGoogle";
  }
}

async function json<T>(r: Response): Promise<T> {
  if (r.status === 204) return undefined as T;
  const cuerpo = await r.text();
  if (!r.ok) {
    let detalle = cuerpo.slice(0, 300);
    try {
      const j = JSON.parse(cuerpo);
      detalle = j.error_description ?? j.error?.message ?? j.error ?? detalle;
    } catch {}
    throw new ErrorGoogle(r.status, `Google respondió ${r.status}: ${detalle}`);
  }
  return (cuerpo ? JSON.parse(cuerpo) : undefined) as T;
}

// ─────────────────────────── OAuth ───────────────────────────

export type ConfigOAuth = { clientId: string; clientSecret: string; redirectUri: string };

export function configOAuthDesdeEntorno(): ConfigOAuth | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const base = process.env.AUTH_URL;
  if (!clientId || !clientSecret || !base) return null;
  return { clientId, clientSecret, redirectUri: new URL("/api/integraciones/google/callback", base).toString() };
}

export function urlDeAutorizacion(cfg: ConfigOAuth, state: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: ALCANCES_GOOGLE.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  return u.toString();
}

type Tokens = { access_token: string; refresh_token?: string; scope: string; expires_in: number };

export async function intercambiarCodigo(cfg: ConfigOAuth, code: string, f: Fetch = fetch): Promise<Tokens> {
  return json<Tokens>(
    await f("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
        grant_type: "authorization_code",
      }),
    }),
  );
}

export async function tokenDeAcceso(cfg: ConfigOAuth, refreshToken: string, f: Fetch = fetch): Promise<string> {
  const t = await json<Tokens>(
    await f("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: "refresh_token",
      }),
    }),
  );
  return t.access_token;
}

export async function revocar(token: string, f: Fetch = fetch): Promise<void> {
  await f(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});
}

// ─────────────────────────── APIs con token ───────────────────────────

export class Google {
  constructor(
    private readonly token: string,
    private readonly f: Fetch = fetch,
  ) {}

  private async pedir<T>(url: string, init: RequestInit = {}): Promise<T> {
    return json<T>(
      await this.f(url, {
        ...init,
        headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json", ...init.headers },
      }),
    );
  }

  /** Canal de YouTube de la cuenta conectada. */
  async miCanal(): Promise<{ id: string; titulo: string; listaSubidas: string } | null> {
    const r = await this.pedir<{
      items?: { id: string; snippet: { title: string }; contentDetails: { relatedPlaylists: { uploads: string } } }[];
    }>("https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true");
    const c = r.items?.[0];
    return c ? { id: c.id, titulo: c.snippet.title, listaSubidas: c.contentDetails.relatedPlaylists.uploads } : null;
  }

  /** Videos subidos al canal (más recientes primero), hasta `maximo`. */
  async videosSubidos(lista: string, maximo = 200): Promise<{ id: string; titulo: string; publicado: Date }[]> {
    const salida: { id: string; titulo: string; publicado: Date }[] = [];
    let pagina: string | undefined;
    do {
      const u = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
      u.search = new URLSearchParams({ part: "snippet,contentDetails", playlistId: lista, maxResults: "50", ...(pagina ? { pageToken: pagina } : {}) }).toString();
      const r = await this.pedir<{
        nextPageToken?: string;
        items?: { snippet: { title: string }; contentDetails: { videoId: string; videoPublishedAt?: string } }[];
      }>(u.toString());
      for (const it of r.items ?? []) {
        if (!it.contentDetails.videoPublishedAt) continue; // privados o programados
        salida.push({ id: it.contentDetails.videoId, titulo: it.snippet.title, publicado: new Date(it.contentDetails.videoPublishedAt) });
      }
      pagina = r.nextPageToken;
    } while (pagina && salida.length < maximo);
    return salida.slice(0, maximo);
  }

  /**
   * Totales acumulados por video entre dos fechas (YouTube Analytics).
   * La API no ofrece impresiones ni CTR de miniaturas: esos llegan por CSV.
   */
  async metricasDeVideos(ids: string[], desde: string, hasta: string) {
    if (ids.length === 0) return new Map<string, MetricasYoutube>();
    const metricas = ["views", "averageViewPercentage", "likes", "comments", "shares", "subscribersGained"];
    const u = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
    u.search = new URLSearchParams({
      ids: "channel==MINE",
      startDate: desde,
      endDate: hasta,
      metrics: metricas.join(","),
      dimensions: "video",
      filters: `video==${ids.join(",")}`,
      maxResults: "200",
    }).toString();
    const r = await this.pedir<{ columnHeaders: { name: string }[]; rows?: (string | number)[][] }>(u.toString());
    const col = (n: string) => r.columnHeaders.findIndex((h) => h.name === n);
    const salida = new Map<string, MetricasYoutube>();
    for (const fila of r.rows ?? []) {
      const num = (n: string) => (col(n) >= 0 ? Number(fila[col(n)]) : null);
      salida.set(String(fila[col("video")]), {
        vistas: num("views"),
        retencion: num("averageViewPercentage"),
        likes: num("likes"),
        comentarios: num("comments"),
        compartidos: num("shares"),
        suscriptores: num("subscribersGained"),
      });
    }
    return salida;
  }

  async eventos(calendario: string, desde: Date, hasta: Date): Promise<EventoGoogle[]> {
    const salida: EventoGoogle[] = [];
    let pagina: string | undefined;
    do {
      const u = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendario)}/events`);
      u.search = new URLSearchParams({
        timeMin: desde.toISOString(),
        timeMax: hasta.toISOString(),
        singleEvents: "true",
        maxResults: "250",
        ...(pagina ? { pageToken: pagina } : {}),
      }).toString();
      const r = await this.pedir<{ nextPageToken?: string; items?: EventoGoogle[] }>(u.toString());
      salida.push(...(r.items ?? []));
      pagina = r.nextPageToken;
    } while (pagina);
    return salida;
  }

  async crearEvento(calendario: string, evento: EventoNuevo): Promise<EventoGoogle> {
    return this.pedir(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendario)}/events`, {
      method: "POST",
      body: JSON.stringify(evento),
    });
  }

  async actualizarEvento(calendario: string, id: string, evento: EventoNuevo): Promise<EventoGoogle> {
    return this.pedir(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendario)}/events/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(evento) },
    );
  }

  async borrarEvento(calendario: string, id: string): Promise<void> {
    await this.pedir(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendario)}/events/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ).catch((e) => {
      if (!(e instanceof ErrorGoogle && (e.estado === 404 || e.estado === 410))) throw e;
    });
  }
}

export type MetricasYoutube = {
  vistas: number | null;
  retencion: number | null;
  likes: number | null;
  comentarios: number | null;
  compartidos: number | null;
  suscriptores: number | null;
};

type Momento = { date?: string; dateTime?: string; timeZone?: string };

export type EventoGoogle = {
  id: string;
  status?: string;
  summary?: string;
  start: Momento;
  end?: Momento;
  extendedProperties?: { private?: Record<string, string> };
};

export type EventoNuevo = {
  summary: string;
  description?: string;
  start: Momento;
  end: Momento;
  extendedProperties?: { private: Record<string, string> };
};
