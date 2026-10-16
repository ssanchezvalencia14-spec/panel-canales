// Tablero de resultados: con la última foto de métricas de cada video calcula
// mejor pilar, mejor hora y mejor día de publicación, y compara ganchos.
// Todo es descriptivo (promedios de lo publicado), no una predicción.

import { offsetMinutos } from "@/lib/dominio/fechas";

export type MetricaTotal = {
  vistas: number | null;
  retencion: number | null;
  ctr: number | null;
  likes: number | null;
  comentarios: number | null;
  compartidos: number | null;
  suscriptores: number | null;
};

export type VideoConMetricas = {
  id: string;
  titulo: string;
  pilar: string | null;
  gancho: string | null;
  scoreGancho: number | null;
  fechaPublicacion: Date | null;
  /** Totales sumados de todas sus publicaciones (vistas, likes…); retención y CTR ponderados por vistas. */
  total: MetricaTotal;
};

export type Grupo = { clave: string; videos: number; vistasPromedio: number; vistasTotales: number };

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** Combina las métricas de varias publicaciones de un mismo video. */
export function combinarMetricas(lista: MetricaTotal[]): MetricaTotal {
  const suma = (k: keyof MetricaTotal) => {
    const valores = lista.map((m) => m[k]).filter((v): v is number => v !== null);
    return valores.length ? valores.reduce((a, b) => a + b, 0) : null;
  };
  const ponderado = (k: "retencion" | "ctr") => {
    const pares = lista.filter((m) => m[k] !== null && (m.vistas ?? 0) > 0);
    const peso = pares.reduce((a, m) => a + (m.vistas ?? 0), 0);
    if (pares.length === 0) {
      const sueltos = lista.map((m) => m[k]).filter((v): v is number => v !== null);
      return sueltos.length ? sueltos.reduce((a, b) => a + b, 0) / sueltos.length : null;
    }
    return pares.reduce((a, m) => a + (m[k] ?? 0) * (m.vistas ?? 0), 0) / peso;
  };
  return {
    vistas: suma("vistas"),
    retencion: ponderado("retencion"),
    ctr: ponderado("ctr"),
    likes: suma("likes"),
    comentarios: suma("comentarios"),
    compartidos: suma("compartidos"),
    suscriptores: suma("suscriptores"),
  };
}

function agrupar(videos: VideoConMetricas[], clave: (v: VideoConMetricas) => string | null): Grupo[] {
  const mapa = new Map<string, number[]>();
  for (const v of videos) {
    const k = clave(v);
    if (k === null || v.total.vistas === null) continue;
    mapa.set(k, [...(mapa.get(k) ?? []), v.total.vistas]);
  }
  return [...mapa.entries()]
    .map(([k, vistas]) => ({
      clave: k,
      videos: vistas.length,
      vistasTotales: vistas.reduce((a, b) => a + b, 0),
      vistasPromedio: Math.round(vistas.reduce((a, b) => a + b, 0) / vistas.length),
    }))
    .sort((a, b) => b.vistasPromedio - a.vistasPromedio);
}

function horaLocal(fecha: Date, zona: string): string {
  const local = new Date(fecha.getTime() + offsetMinutos(zona, fecha) * 60000);
  return `${String(local.getUTCHours()).padStart(2, "0")}:00`;
}

function diaLocal(fecha: Date, zona: string): string {
  const local = new Date(fecha.getTime() + offsetMinutos(zona, fecha) * 60000);
  return DIAS[local.getUTCDay()];
}

export type Resultados = {
  conMetricas: number;
  porPilar: Grupo[];
  porHora: Grupo[];
  porDia: Grupo[];
  /** Videos con gancho, de más a menos vistas. */
  ganchos: { titulo: string; gancho: string; scoreGancho: number | null; vistas: number; retencion: number | null }[];
};

export function calcularResultados(videos: VideoConMetricas[], zona: string): Resultados {
  const medidos = videos.filter((v) => v.total.vistas !== null);
  return {
    conMetricas: medidos.length,
    porPilar: agrupar(medidos, (v) => v.pilar),
    porHora: agrupar(medidos, (v) => (v.fechaPublicacion ? horaLocal(v.fechaPublicacion, zona) : null)),
    porDia: agrupar(medidos, (v) => (v.fechaPublicacion ? diaLocal(v.fechaPublicacion, zona) : null)),
    ganchos: medidos
      .filter((v) => v.gancho)
      .map((v) => ({
        titulo: v.titulo,
        gancho: v.gancho!,
        scoreGancho: v.scoreGancho,
        vistas: v.total.vistas!,
        retencion: v.total.retencion,
      }))
      .sort((a, b) => b.vistas - a.vistas),
  };
}

/** Celda CSV segura (comillas y, para hojas de cálculo, sin fórmulas). */
export function celdaCsv(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  let t = String(valor);
  if (/^[=+\-@\t\r]/.test(t) && typeof valor === "string") t = `'${t}`;
  return /[",;\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
