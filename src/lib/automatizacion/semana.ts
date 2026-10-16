// Semana ISO (lunes a domingo) de una fecha local "YYYY-MM-DD".

import { sumarDias } from "@/lib/dominio/calendario";

const DIA = 864e5;
const utc = (f: string) => {
  const [a, m, d] = f.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};
const diaSemana = (d: Date) => (d.getUTCDay() + 6) % 7; // 0 = lunes

/** «2026-W43» para la fecha local dada. La semana 1 es la que contiene el primer jueves del año. */
export function semanaISO(fecha: string): string {
  const d = utc(fecha);
  const jueves = new Date(d.getTime() + (3 - diaSemana(d)) * DIA);
  const anio = jueves.getUTCFullYear();
  const enero4 = new Date(Date.UTC(anio, 0, 4));
  const primerJueves = new Date(enero4.getTime() + (3 - diaSemana(enero4)) * DIA);
  const semana = 1 + Math.round((jueves.getTime() - primerJueves.getTime()) / (7 * DIA));
  return `${anio}-W${String(semana).padStart(2, "0")}`;
}

/** Lunes y domingo (fechas locales) de la semana de la fecha dada. */
export function limitesSemana(fecha: string): { lunes: string; domingo: string } {
  const lunes = sumarDias(fecha, -diaSemana(utc(fecha)));
  return { lunes, domingo: sumarDias(lunes, 6) };
}
