import { describe, expect, it } from "vitest";
import { reconocerCanal } from "@/lib/youtube/enlace";
import { CanalNoEncontrado, duracionASegundos, ErrorYoutube, YoutubePublico } from "@/lib/youtube/publico";
import { cambio, esShort, sumarSeries, vistasRecientes } from "@/lib/youtube/estadisticas";

const ID = "UC1234567890123456789012";

describe("reconocerCanal", () => {
  it("entiende las formas de pegar un canal", () => {
    expect(reconocerCanal("https://www.youtube.com/@MiCanal")).toEqual({ tipo: "handle", valor: "@MiCanal" });
    expect(reconocerCanal("youtube.com/@mi.canal/videos")).toEqual({ tipo: "handle", valor: "@mi.canal" });
    expect(reconocerCanal("@MiCanal")).toEqual({ tipo: "handle", valor: "@MiCanal" });
    expect(reconocerCanal(`https://youtube.com/channel/${ID}`)).toEqual({ tipo: "id", valor: ID });
    expect(reconocerCanal(ID)).toEqual({ tipo: "id", valor: ID });
    expect(reconocerCanal("https://www.youtube.com/user/viejo")).toEqual({ tipo: "usuario", valor: "viejo" });
    expect(reconocerCanal("https://www.youtube.com/c/NombreCustom")).toEqual({ tipo: "nombre", valor: "NombreCustom" });
    expect(reconocerCanal("https://m.youtube.com/@Acentuado%C3%B1")).toEqual({ tipo: "handle", valor: "@Acentuadoñ" });
  });

  it("acepta el enlace de un video para llegar al canal", () => {
    expect(reconocerCanal("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3")).toEqual({ tipo: "video", valor: "dQw4w9WgXcQ" });
    expect(reconocerCanal("https://youtu.be/dQw4w9WgXcQ")).toEqual({ tipo: "video", valor: "dQw4w9WgXcQ" });
    expect(reconocerCanal("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toEqual({ tipo: "video", valor: "dQw4w9WgXcQ" });
  });

  it("rechaza lo que no es de YouTube", () => {
    expect(reconocerCanal("")).toBeNull();
    expect(reconocerCanal("hola")).toBeNull();
    expect(reconocerCanal("https://www.tiktok.com/@alguien")).toBeNull();
    expect(reconocerCanal("https://youtube.com.malo.test/@x")).toBeNull();
    expect(reconocerCanal("https://youtube.com/watch")).toBeNull();
  });
});

describe("duracionASegundos", () => {
  it("convierte ISO 8601", () => {
    expect(duracionASegundos("PT45S")).toBe(45);
    expect(duracionASegundos("PT1M")).toBe(60);
    expect(duracionASegundos("PT1H2M3S")).toBe(3723);
    expect(duracionASegundos("P0D")).toBe(0);
    expect(duracionASegundos(undefined)).toBeNull();
    expect(duracionASegundos("basura")).toBeNull();
  });
});

function falso(respuestas: Record<string, unknown>) {
  const llamadas: URL[] = [];
  const f = (async (entrada: URL | string) => {
    const url = new URL(String(entrada));
    llamadas.push(url);
    const ruta = url.pathname.split("/").pop()!;
    const cuerpo = respuestas[ruta];
    if (cuerpo === undefined) return new Response("{}", { status: 200 });
    if (cuerpo instanceof Response) return cuerpo;
    return new Response(JSON.stringify(cuerpo), { status: 200 });
  }) as typeof fetch;
  return { f, llamadas };
}

const CANAL = {
  items: [
    {
      id: ID,
      snippet: { title: "Mi Canal", customUrl: "@micanal", defaultLanguage: "es", thumbnails: { medium: { url: "https://img/a.jpg" } } },
      statistics: { subscriberCount: "1500", viewCount: "99000", videoCount: "42" },
      contentDetails: { relatedPlaylists: { uploads: "UU123" } },
    },
  ],
};

describe("YoutubePublico", () => {
  it("resuelve un @handle y devuelve los totales", async () => {
    const { f, llamadas } = falso({ channels: CANAL });
    const c = await new YoutubePublico("K", f).resolver("https://youtube.com/@micanal");
    expect(c).toMatchObject({ id: ID, titulo: "Mi Canal", handle: "@micanal", suscriptores: 1500, vistasTotales: 99000, videosTotales: 42, listaSubidas: "UU123" });
    expect(llamadas[0].searchParams.get("forHandle")).toBe("@micanal");
    expect(llamadas[0].searchParams.get("key")).toBe("K");
  });

  it("deja los suscriptores en null si el canal los oculta", async () => {
    const oculto = { items: [{ ...CANAL.items[0], statistics: { hiddenSubscriberCount: true, viewCount: "10", videoCount: "1" } }] };
    const c = await new YoutubePublico("K", falso({ channels: oculto }).f).resolver("@micanal");
    expect(c.suscriptores).toBeNull();
  });

  it("desde el enlace de un video llega al canal", async () => {
    const { f, llamadas } = falso({ videos: { items: [{ snippet: { channelId: ID } }] }, channels: CANAL });
    const c = await new YoutubePublico("K", f).resolver("https://youtu.be/dQw4w9WgXcQ");
    expect(c.id).toBe(ID);
    expect(llamadas.map((l) => l.pathname.split("/").pop())).toEqual(["videos", "channels"]);
  });

  it("explica los errores en lenguaje claro", async () => {
    await expect(new YoutubePublico("K", falso({ channels: { items: [] } }).f).resolver("@nadie")).rejects.toBeInstanceOf(CanalNoEncontrado);
    await expect(new YoutubePublico("K", falso({}).f).resolver("hola")).rejects.toThrow(/no parece un enlace/);
    const cuota = new Response(JSON.stringify({ error: { message: "x", errors: [{ reason: "quotaExceeded" }] } }), { status: 403 });
    await expect(new YoutubePublico("K", falso({ channels: cuota }).f).resolver("@micanal")).rejects.toThrow(/cuota/);
    const clave = new Response(JSON.stringify({ error: { message: "API key not valid. Please pass a valid API key." } }), { status: 400 });
    await expect(new YoutubePublico("K", falso({ channels: clave }).f).resolver("@micanal")).rejects.toBeInstanceOf(ErrorYoutube);
  });

  it("trae los videos recientes con sus cifras", async () => {
    const { f, llamadas } = falso({
      playlistItems: { items: [{ contentDetails: { videoId: "aaaaaaaaaaa" } }, { contentDetails: { videoId: "bbbbbbbbbbb" } }] },
      videos: {
        items: [
          {
            id: "aaaaaaaaaaa",
            snippet: { title: "Uno", publishedAt: "2026-10-01T15:00:00Z", thumbnails: { medium: { url: "https://img/1.jpg" } } },
            statistics: { viewCount: "1200", likeCount: "80", commentCount: "5" },
            contentDetails: { duration: "PT45S" },
          },
          { id: "bbbbbbbbbbb", snippet: { title: "Dos", publishedAt: "2026-10-05T15:00:00Z" }, statistics: { viewCount: "300" }, contentDetails: { duration: "PT10M" } },
          { id: "sin-fecha", snippet: { title: "Raro" } },
        ],
      },
    });
    const v = await new YoutubePublico("K", f).videosRecientes("UU123");
    expect(v).toHaveLength(2);
    expect(v[0]).toMatchObject({ id: "aaaaaaaaaaa", titulo: "Uno", vistas: 1200, likes: 80, comentarios: 5, duracionSeg: 45 });
    expect(v[1]).toMatchObject({ vistas: 300, likes: null, miniaturaUrl: null });
    expect(llamadas.at(-1)!.searchParams.get("id")).toBe("aaaaaaaaaaa,bbbbbbbbbbb");
  });
});

describe("estadísticas globales", () => {
  const foto = (fecha: string, suscriptores: number | null, vistasTotales: number | null = null) => ({ fecha, suscriptores, vistasTotales });

  it("calcula el cambio contra una fecha de referencia", () => {
    const fotos = [foto("2026-09-01", 100), foto("2026-09-20", 130), foto("2026-10-01", 150), foto("2026-10-19", 190)];
    expect(cambio(fotos, "suscriptores", 7)).toEqual({ valor: 40, desde: "2026-10-01" });
    expect(cambio(fotos, "suscriptores", 28)).toEqual({ valor: 60, desde: "2026-09-20" });
    expect(cambio(fotos, "suscriptores", 90)).toEqual({ valor: 90, desde: "2026-09-01" });
    expect(cambio([foto("2026-10-19", 5)], "suscriptores", 7)).toBeNull();
    expect(cambio([foto("2026-10-18", null), foto("2026-10-19", null)], "suscriptores", 7)).toBeNull();
  });

  it("suma canales sin inventar saltos cuando entra uno nuevo", () => {
    const a = [foto("2026-10-01", 100), foto("2026-10-03", 110), foto("2026-10-05", 120)];
    const b = [foto("2026-10-03", 50), foto("2026-10-05", 60)];
    expect(sumarSeries([a, b], "suscriptores")).toEqual([
      { fecha: "2026-10-03", valor: 160 },
      { fecha: "2026-10-05", valor: 180 },
    ]);
    expect(sumarSeries([a, []], "suscriptores")).toEqual([]);
    expect(sumarSeries([], "suscriptores")).toEqual([]);
  });

  it("cuenta las vistas de los videos recientes", () => {
    const ahora = new Date("2026-10-19T12:00:00Z");
    const videos = [
      { publicadoEn: new Date("2026-10-18T00:00:00Z"), vistas: 100 },
      { publicadoEn: new Date("2026-10-01T00:00:00Z"), vistas: 50 },
      { publicadoEn: new Date("2026-08-01T00:00:00Z"), vistas: 9999 },
      { publicadoEn: new Date("2026-10-10T00:00:00Z"), vistas: null },
    ];
    expect(vistasRecientes(videos, 28, ahora)).toEqual({ videos: 3, vistas: 150 });
    expect(esShort(45)).toBe(true);
    expect(esShort(600)).toBe(false);
    expect(esShort(null)).toBe(false);
  });
});

import { configDeCanalPublico, idiomaSeguro, PALETA_CANALES, slugLibre } from "@/lib/youtube/canal-nuevo";
import { esquemaCanal } from "@/lib/dominio/canal-config";

describe("canal nuevo por enlace", () => {
  it("normaliza el idioma que informa YouTube", () => {
    expect(idiomaSeguro("es-419")).toBe("es");
    expect(idiomaSeguro("en-US")).toBe("en-US");
    expect(idiomaSeguro("PT_br")).toBe("pt-BR");
    expect(idiomaSeguro(null)).toBe("es");
    expect(idiomaSeguro("???")).toBe("es");
  });

  it("genera un identificador libre", () => {
    expect(slugLibre({ handle: "@Mi.Canal", titulo: "x" }, new Set())).toBe("mi-canal");
    expect(slugLibre({ handle: null, titulo: "Cómo Ñandú  TV" }, new Set())).toBe("como-nandu-tv");
    expect(slugLibre({ handle: "@mi", titulo: "x" }, new Set(["mi", "mi-2"]))).toBe("mi-3");
    expect(slugLibre({ handle: null, titulo: "!!!" }, new Set())).toBe("canal");
  });

  it("produce una configuración que el panel acepta", () => {
    const cfg = configDeCanalPublico({ handle: "@micanal", titulo: "Mi Canal", idioma: "es-419" }, { slugsUsados: new Set(["otro"]), cantidadCanales: 1 });
    expect(esquemaCanal.safeParse(cfg).success).toBe(true);
    expect(cfg).toMatchObject({ slug: "micanal", nombre: "Mi Canal", idioma: "es", colorAcento: PALETA_CANALES[1] });
    // Los colores rotan entre canales.
    const novena = configDeCanalPublico({ handle: null, titulo: "N", idioma: null }, { slugsUsados: new Set(), cantidadCanales: PALETA_CANALES.length });
    expect(novena.colorAcento).toBe(PALETA_CANALES[0]);
  });
});

import { imagenSegura } from "@/lib/youtube/estadisticas";

describe("imagenSegura", () => {
  it("solo deja pasar imágenes https de YouTube/Google", () => {
    expect(imagenSegura("https://i.ytimg.com/vi/x/mqdefault.jpg")).toBe("https://i.ytimg.com/vi/x/mqdefault.jpg");
    expect(imagenSegura("https://yt3.ggpht.com/a=s88")).toBe("https://yt3.ggpht.com/a=s88");
    expect(imagenSegura("http://i.ytimg.com/x.jpg")).toBeNull();
    expect(imagenSegura("https://ytimg.com.malo.test/x.jpg")).toBeNull();
    expect(imagenSegura("javascript:alert(1)")).toBeNull();
    expect(imagenSegura(null)).toBeNull();
  });
});
