// Calendario mensual de un canal: días de publicación y de producción
// (N días antes, según las reglas del canal), en la zona horaria del canal.

import { fechaLocal } from "./fechas";

export type TipoEvento = "publicacion" | "produccion" | "reunion";

export type EventoCalendario = { tipo: TipoEvento; videoId: string; titulo: string };

/** Evento leído de Google Calendar (reuniones y otros). */
export type Reunion = { id: string; titulo: string; inicio: Date; todoElDia: boolean };

export type DiaCalendario = {
  fecha: string; // YYYY-MM-DD
  delMes: boolean;
  eventos: EventoCalendario[];
};

const RE_MES = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function esMesValido(mes: string): boolean {
  return RE_MES.test(mes);
}

/** Suma días a una fecha "YYYY-MM-DD" (aritmética de calendario, sin zonas). */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

export function mesVecino(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** Lee `diasProduccionAntes` de las reglas del canal (3 si no está definido). */
export function diasProduccion(reglas: unknown): number {
  const valor = (reglas as { diasProduccionAntes?: unknown } | null)?.diasProduccionAntes;
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 0 ? valor : 3;
}

/** Semanas (lunes a domingo) que cubren el mes, con sus eventos. */
export function construirMes(
  mes: string,
  videos: ReadonlyArray<{ id: string; titulo: string; fechaPublicacion: Date | null }>,
  zona: string,
  diasAntes: number,
  reuniones: readonly Reunion[] = [],
): DiaCalendario[][] {
  if (!esMesValido(mes)) throw new Error(`Mes inválido: «${mes}» (se espera AAAA-MM)`);

  const eventos = new Map<string, EventoCalendario[]>();
  const agregar = (fecha: string, e: EventoCalendario) => eventos.set(fecha, [...(eventos.get(fecha) ?? []), e]);
  for (const v of videos) {
    if (!v.fechaPublicacion) continue;
    const dia = fechaLocal(v.fechaPublicacion, zona);
    agregar(dia, { tipo: "publicacion", videoId: v.id, titulo: v.titulo });
    if (diasAntes > 0) agregar(sumarDias(dia, -diasAntes), { tipo: "produccion", videoId: v.id, titulo: v.titulo });
  }

  for (const r of reuniones) {
    // Los eventos de día completo se guardan a medianoche UTC de su fecha.
    const dia = r.todoElDia ? r.inicio.toISOString().slice(0, 10) : fechaLocal(r.inicio, zona);
    agregar(dia, { tipo: "reunion", videoId: r.id, titulo: r.titulo });
  }

  const primero = `${mes}-01`;
  const [a, m] = mes.split("-").map(Number);
  const diaSemana = (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7; // 0 = lunes
  let cursor = sumarDias(primero, -diaSemana);
  const semanas: DiaCalendario[][] = [];
  do {
    const semana: DiaCalendario[] = [];
    for (let i = 0; i < 7; i++) {
      semana.push({ fecha: cursor, delMes: cursor.startsWith(mes), eventos: eventos.get(cursor) ?? [] });
      cursor = sumarDias(cursor, 1);
    }
    semanas.push(semana);
  } while (cursor.startsWith(mes));
  return semanas;
}
