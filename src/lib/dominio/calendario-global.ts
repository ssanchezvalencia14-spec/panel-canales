// Calendario de toda la red: junta el calendario de cada canal visible en una
// sola grilla, con el canal de cada evento para poder filtrar y colorear.

import { construirMes, type Reunion, type TipoEvento } from "./calendario";
import { fechaLocal } from "./fechas";

export type TipoEventoGlobal = TipoEvento | "publicado";

export type EventoGlobal = {
  clave: string;
  tipo: TipoEventoGlobal;
  titulo: string;
  canalSlug: string;
  canalNombre: string;
  color: string;
  /** Enlace al video en YouTube cuando el evento es un video ya publicado. */
  url?: string;
};

export type DiaGlobal = { fecha: string; delMes: boolean; eventos: EventoGlobal[] };

export type EntradaCanal = {
  canal: { slug: string; nombre: string; color: string; zona: string; diasAntes: number };
  /** Videos del panel (idea → publicado) con fecha prevista. */
  videos: ReadonlyArray<{ id: string; titulo: string; fechaPublicacion: Date | null }>;
  reuniones: readonly Reunion[];
  /** Videos ya publicados en YouTube (datos públicos). */
  publicados: ReadonlyArray<{ id: string; titulo: string; publicadoEn: Date }>;
};

const ORDEN: Record<TipoEventoGlobal, number> = { publicacion: 0, publicado: 1, produccion: 2, reunion: 3 };

export function construirMesGlobal(mes: string, entradas: readonly EntradaCanal[]): DiaGlobal[][] {
  // La grilla (semanas de lunes a domingo) es la misma para todos los canales.
  const base = construirMes(mes, [], "UTC", 0);
  const semanas: DiaGlobal[][] = base.map((s) => s.map((d) => ({ fecha: d.fecha, delMes: d.delMes, eventos: [] })));
  const porFecha = new Map(semanas.flat().map((d) => [d.fecha, d]));

  for (const { canal, videos, reuniones, publicados } of entradas) {
    const propios = construirMes(mes, videos, canal.zona, canal.diasAntes, reuniones);
    for (const dia of propios.flat()) {
      const destino = porFecha.get(dia.fecha);
      if (!destino) continue;
      for (const e of dia.eventos) {
        destino.eventos.push({
          clave: `${canal.slug}:${e.tipo}:${e.videoId}`,
          tipo: e.tipo,
          titulo: e.titulo,
          canalSlug: canal.slug,
          canalNombre: canal.nombre,
          color: canal.color,
        });
      }
    }

    // Un video ya publicado en YouTube no se repite si el panel ya tiene uno programado ese día.
    const diasConPublicacion = new Set(
      videos.filter((v) => v.fechaPublicacion).map((v) => fechaLocal(v.fechaPublicacion!, canal.zona)),
    );
    for (const p of publicados) {
      const dia = fechaLocal(p.publicadoEn, canal.zona);
      const destino = porFecha.get(dia);
      if (!destino || diasConPublicacion.has(dia)) continue;
      destino.eventos.push({
        clave: `${canal.slug}:publicado:${p.id}`,
        tipo: "publicado",
        titulo: p.titulo,
        canalSlug: canal.slug,
        canalNombre: canal.nombre,
        color: canal.color,
        url: `https://www.youtube.com/watch?v=${p.id}`,
      });
    }
  }

  for (const d of porFecha.values()) {
    d.eventos.sort((a, b) => ORDEN[a.tipo] - ORDEN[b.tipo] || a.canalNombre.localeCompare(b.canalNombre) || a.titulo.localeCompare(b.titulo));
  }
  return semanas;
}

/** Color de texto legible (oscuro o claro) sobre un fondo #RRGGBB. */
export function textoSobre(fondo: string): "#0a1140" | "#ffffff" {
  const m = /^#([0-9a-fA-F]{6})$/.exec(fondo);
  if (!m) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminancia = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminancia > 0.35 ? "#0a1140" : "#ffffff";
}
