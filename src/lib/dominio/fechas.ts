// Conversión de fechas locales de un canal (zona horaria IANA) a UTC y al revés.
// Sin dependencias: usa Intl, disponible en Node y en el navegador.

const formateadores = new Map<string, Intl.DateTimeFormat>();

function formateador(zona: string): Intl.DateTimeFormat {
  let f = formateadores.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zona,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formateadores.set(zona, f);
  }
  return f;
}

/** Diferencia en minutos entre la hora local de `zona` y UTC en el instante dado. */
export function offsetMinutos(zona: string, instante: Date): number {
  const partes = Object.fromEntries(
    formateador(zona)
      .formatToParts(instante)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  );
  const comoUtc = Date.UTC(
    partes.year,
    partes.month - 1,
    partes.day,
    partes.hour,
    partes.minute,
    partes.second,
  );
  return Math.round((comoUtc - instante.getTime()) / 60000);
}

export function esZonaHorariaValida(zona: string): boolean {
  try {
    formateador(zona);
    return true;
  } catch {
    return false;
  }
}

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function esHoraValida(hora: string): boolean {
  return RE_HORA.test(hora);
}

/**
 * Convierte una fecha ("YYYY-MM-DD") y hora ("HH:mm") locales de la zona del
 * canal al instante UTC correspondiente.
 */
export function fechaLocalAUtc(fecha: string, hora: string, zona: string): Date {
  const f = RE_FECHA.exec(fecha);
  const h = RE_HORA.exec(hora);
  if (!f) throw new Error(`Fecha inválida: «${fecha}» (se espera AAAA-MM-DD)`);
  if (!h) throw new Error(`Hora inválida: «${hora}» (se espera HH:mm)`);

  const supuesto = Date.UTC(+f[1], +f[2] - 1, +f[3], +h[1], +h[2]);
  // Dos pasadas para acertar en los cambios de horario de verano.
  const off1 = offsetMinutos(zona, new Date(supuesto));
  let utc = supuesto - off1 * 60000;
  const off2 = offsetMinutos(zona, new Date(utc));
  if (off2 !== off1) utc = supuesto - off2 * 60000;
  return new Date(utc);
}

/** Fecha local ("YYYY-MM-DD") de un instante en la zona dada. */
export function fechaLocal(instante: Date, zona: string): string {
  const p = Object.fromEntries(
    formateador(zona)
      .formatToParts(instante)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

/** Texto legible de fecha y hora en la zona e idioma del canal. */
export function formatearFechaHora(
  instante: Date,
  zona: string,
  idioma = "es",
): string {
  return new Intl.DateTimeFormat(idioma, {
    timeZone: zona,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(instante);
}
