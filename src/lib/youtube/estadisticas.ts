// Cálculos de las estadísticas globales a partir de las fotos diarias y de los
// videos públicos de cada canal. Funciones puras, sin base de datos.

export type FotoCanal = { fecha: string; suscriptores: number | null; vistasTotales: number | null };

/** Cambio de una serie entre la última foto y la de hace `dias` (o la más antigua si no alcanza). */
export function cambio(
  fotos: readonly FotoCanal[],
  campo: "suscriptores" | "vistasTotales",
  dias: number,
): { valor: number; desde: string } | null {
  const con = fotos.filter((f) => f[campo] !== null).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (con.length < 2) return null;
  const ultima = con.at(-1)!;
  const [a, m, d] = ultima.fecha.split("-").map(Number);
  const objetivo = new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
  // La foto más reciente que no sea posterior al día objetivo; si no hay, la más antigua.
  const previas = con.filter((f) => f.fecha <= objetivo);
  const referencia = previas.at(-1) ?? con[0];
  if (referencia.fecha === ultima.fecha) return null;
  return { valor: (ultima[campo] as number) - (referencia[campo] as number), desde: referencia.fecha };
}

/**
 * Suma de una métrica entre varios canales día a día. Arrastra el último valor
 * conocido de cada canal y solo empieza cuando todos tienen algún dato, para
 * que sumar un canal nuevo no parezca un salto de crecimiento.
 */
export function sumarSeries(
  series: ReadonlyArray<readonly FotoCanal[]>,
  campo: "suscriptores" | "vistasTotales",
): { fecha: string; valor: number }[] {
  const validas = series.map((s) => s.filter((f) => f[campo] !== null).sort((x, y) => x.fecha.localeCompare(y.fecha))).filter((s) => s.length > 0);
  if (validas.length === 0 || validas.length < series.length) return [];
  const inicio = validas.map((s) => s[0].fecha).reduce((a, b) => (a > b ? a : b));
  const fechas = [...new Set(validas.flatMap((s) => s.map((f) => f.fecha)))].filter((f) => f >= inicio).sort();
  return fechas.map((fecha) => ({
    fecha,
    valor: validas.reduce((suma, s) => suma + ((s.filter((f) => f.fecha <= fecha).at(-1)![campo] as number) ?? 0), 0),
  }));
}

export type VideoConVistas = { publicadoEn: Date; vistas: number | null };

/** Vistas acumuladas (hoy) de los videos publicados en los últimos `dias` días. */
export function vistasRecientes(videos: readonly VideoConVistas[], dias: number, ahora = new Date()): { videos: number; vistas: number } {
  const limite = ahora.getTime() - dias * 86_400_000;
  const recientes = videos.filter((v) => v.publicadoEn.getTime() >= limite);
  return { videos: recientes.length, vistas: recientes.reduce((s, v) => s + (v.vistas ?? 0), 0) };
}

/** Los Shorts de YouTube duran hasta 3 minutos; por debajo de 61 s es casi seguro un Short. */
export const esShort = (duracionSeg: number | null): boolean => duracionSeg !== null && duracionSeg <= 60;

const HOSTS_IMAGEN = ["ytimg.com", "ggpht.com", "googleusercontent.com"];

/** Solo se muestran imágenes https de los servidores de YouTube/Google; cualquier otra cosa se descarta. */
export function imagenSegura(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && HOSTS_IMAGEN.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`)) ? u.toString() : null;
  } catch {
    return null;
  }
}
