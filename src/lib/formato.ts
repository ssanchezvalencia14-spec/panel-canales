// Formato de cifras para las pantallas del panel.

/** 1.234.567 → «1,2 M» (compacto, según el idioma). */
export function compacto(n: number | null | undefined, idioma = "es"): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat(idioma, { notation: "compact", maximumFractionDigits: n >= 100_000 ? 1 : 1 }).format(n);
}

export function entero(n: number | null | undefined, idioma = "es"): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat(idioma).format(Math.round(n));
}

/** +120 / −35 / 0, con signo explícito. */
export function conSigno(n: number | null | undefined, idioma = "es"): string {
  if (n === null || n === undefined) return "—";
  const t = new Intl.NumberFormat(idioma, { notation: "compact", maximumFractionDigits: 1 }).format(Math.abs(n));
  return n > 0 ? `+${t}` : n < 0 ? `−${t}` : "0";
}

/** «hace 5 min», «hace 2 h», «hace 3 d». */
export function haceCuanto(fecha: Date | null | undefined, ahora = new Date()): string {
  if (!fecha) return "nunca";
  const min = Math.max(0, Math.round((ahora.getTime() - fecha.getTime()) / 60_000));
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}
