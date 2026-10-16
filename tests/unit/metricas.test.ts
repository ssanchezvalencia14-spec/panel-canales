import { describe, expect, it } from "vitest";
import { campoDeColumna, leerCsv, leerMetricasCsv, leerNumero } from "@/lib/metricas/csv";
import { calcularResultados, celdaCsv, combinarMetricas, type VideoConMetricas } from "@/lib/metricas/resultados";
import { idDeTiktok, idDeYoutube, reconocerEnlace } from "@/lib/dominio/plataformas";
import { cifrar, descifrar } from "@/lib/cifrado";

describe("enlaces de plataformas", () => {
  it("reconoce YouTube en todas sus formas", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s",
      "https://youtu.be/dQw4w9WgXcQ",
      "youtube.com/shorts/dQw4w9WgXcQ",
      "https://m.youtube.com/embed/dQw4w9WgXcQ",
      "dQw4w9WgXcQ",
    ]) {
      expect(idDeYoutube(url), url).toBe("dQw4w9WgXcQ");
    }
    expect(idDeYoutube("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("reconoce TikTok y distingue Shorts", () => {
    expect(idDeTiktok("https://www.tiktok.com/@canal/video/7312345678901234567?lang=es")).toBe("7312345678901234567");
    expect(reconocerEnlace("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toEqual({
      plataforma: "youtube_shorts",
      externoId: "dQw4w9WgXcQ",
    });
    expect(reconocerEnlace("https://www.tiktok.com/@x/video/7312345678901234567")?.plataforma).toBe("tiktok");
    expect(reconocerEnlace("hola")).toBeNull();
  });
});

describe("números con separadores", () => {
  it("interpreta miles y decimales en ambas convenciones", () => {
    expect(leerNumero("1.234", true)).toBe(1234);
    expect(leerNumero("1,234", true)).toBe(1234);
    expect(leerNumero("1.234.567", true)).toBe(1234567);
    expect(leerNumero("1.234,5", false)).toBe(1234.5);
    expect(leerNumero("1,234.5", false)).toBe(1234.5);
    expect(leerNumero("12,5 %", false)).toBe(12.5);
    expect(leerNumero("4.2", false)).toBe(4.2);
    expect(leerNumero("", true)).toBeNull();
    expect(leerNumero("n/d", true)).toBeNull();
  });
});

describe("CSV de métricas", () => {
  it("lee comillas y detecta el separador", () => {
    expect(leerCsv('a;b\n"x;y";"di ""hola"""\n')).toEqual([
      ["a", "b"],
      ["x;y", 'di "hola"'],
    ]);
  });

  it("reconoce encabezados de YouTube Studio en español e inglés", () => {
    expect(campoDeColumna("Contenido")).toBe("referencia");
    expect(campoDeColumna("Título del video")).toBe("titulo");
    expect(campoDeColumna("Porcentaje medio visto (%)")).toBe("retencion");
    expect(campoDeColumna("Porcentaje de clics de las impresiones (%)")).toBe("ctr");
    expect(campoDeColumna("Impressions click-through rate (%)")).toBe("ctr");
    expect(campoDeColumna("Average percentage viewed (%)")).toBe("retencion");
    expect(campoDeColumna("Video views")).toBe("vistas");
    expect(campoDeColumna("Fecha de publicación del video")).toBeNull();
  });

  it("lee un export de YouTube Studio e ignora la fila Total", () => {
    const csv = [
      "Contenido,Título del video,Fecha de publicación del video,Vistas,Porcentaje medio visto (%),Porcentaje de clics de las impresiones (%),Suscriptores",
      "Total,,,\"1,500\",40.5,5.1,12",
      "dQw4w9WgXcQ,Gota a gota,\"Oct 15, 2026\",\"1,500\",40.5,5.1,12",
    ].join("\n");
    const { filas, avisos } = leerMetricasCsv(csv);
    expect(avisos).toEqual([]);
    expect(filas).toEqual([
      {
        referencia: "dQw4w9WgXcQ",
        titulo: "Gota a gota",
        fecha: null,
        vistas: 1500,
        retencion: 40.5,
        ctr: 5.1,
        likes: null,
        comentarios: null,
        compartidos: null,
        suscriptores: 12,
      },
    ]);
  });

  it("lee una hoja de TikTok y avisa de valores ilegibles", () => {
    const csv = "Video link;Date;Video views;Likes;Comments;Shares\nhttps://www.tiktok.com/@x/video/7312345678901234567;2026-10-20;2.300;120;8;abc\n";
    const { filas, avisos } = leerMetricasCsv(csv);
    expect(filas[0]).toMatchObject({ fecha: "2026-10-20", vistas: 2300, likes: 120, comentarios: 8, compartidos: null });
    expect(avisos[0]).toMatch(/abc/);
  });

  it("exige una columna para identificar el video", () => {
    expect(leerMetricasCsv("Vistas\n10\n").avisos[0]).toMatch(/columna de video/);
  });
});

describe("resultados", () => {
  const m = (vistas: number | null, retencion: number | null = null) => ({
    vistas,
    retencion,
    ctr: null,
    likes: null,
    comentarios: null,
    compartidos: null,
    suscriptores: null,
  });
  const v = (id: string, pilar: string, iso: string, vistas: number | null, gancho: string | null = null): VideoConMetricas => ({
    id,
    titulo: id,
    pilar,
    gancho,
    scoreGancho: gancho ? 3.5 : null,
    fechaPublicacion: new Date(iso),
    total: m(vistas),
  });

  it("combina publicaciones ponderando la retención por vistas", () => {
    const c = combinarMetricas([m(100, 50), m(300, 30)]);
    expect(c.vistas).toBe(400);
    expect(c.retencion).toBe(35);
  });

  it("agrupa por pilar, hora y día en la zona del canal, de mejor a peor", () => {
    const r = calcularResultados(
      [
        v("a", "Pilar 1", "2026-10-19T17:00:00Z", 1000, "Escena"), // lun 12:00 Bogotá
        v("b", "Pilar 2", "2026-10-21T17:00:00Z", 3000, "Pregunta"), // mié 12:00
        v("c", "Pilar 2", "2026-10-23T23:00:00Z", 1000), // vie 18:00
        v("d", "Pilar 1", "2026-10-26T17:00:00Z", null), // sin métricas: no cuenta
      ],
      "America/Bogota",
    );
    expect(r.conMetricas).toBe(3);
    expect(r.porPilar.map((g) => [g.clave, g.vistasPromedio])).toEqual([
      ["Pilar 2", 2000],
      ["Pilar 1", 1000],
    ]);
    expect(r.porHora[0]).toMatchObject({ clave: "12:00", videos: 2, vistasPromedio: 2000 });
    expect(r.porDia[0].clave).toBe("mié");
    expect(r.ganchos.map((g) => g.gancho)).toEqual(["Pregunta", "Escena"]);
  });

  it("las celdas CSV no inyectan fórmulas", () => {
    expect(celdaCsv("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(celdaCsv('a,"b"')).toBe('"a,""b"""');
    expect(celdaCsv(-5)).toBe("-5");
    expect(celdaCsv(null)).toBe("");
  });
});

describe("cifrado de secretos", () => {
  const clave = Buffer.alloc(32, 7).toString("base64");
  it("cifra y descifra, y detecta manipulación", () => {
    const c = cifrar("refresh-token-de-prueba", clave);
    expect(c).not.toContain("refresh");
    expect(descifrar(c, clave)).toBe("refresh-token-de-prueba");
    const roto = c.slice(0, -2) + (c.endsWith("A") ? "BB" : "AA");
    expect(() => descifrar(roto, clave)).toThrow();
    expect(() => cifrar("x", "corta")).toThrow(/32 bytes/);
  });
});
