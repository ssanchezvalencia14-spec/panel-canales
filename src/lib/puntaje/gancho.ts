// Puntaje de ganchos (primera frase de un video), de 0 a 100.
//
// Reimplementación propia de la idea de hookscore_es.py descrita en la skill del
// canal (5 propiedades: especificidad, dirigido a ti, riesgo, curiosidad,
// brevedad). NO es un port línea a línea: los puntajes pueden diferir de los
// del script original. Es una heurística para descartar ganchos flojos, no
// predice resultados.

export const OBJETIVO_GANCHO_POR_DEFECTO = 72;

export type Propiedad = "especificidad" | "dirigido" | "riesgo" | "curiosidad" | "brevedad";

export const NOMBRE_PROPIEDAD: Record<Propiedad, string> = {
  especificidad: "Especificidad",
  dirigido: "Dirigido a ti",
  riesgo: "Riesgo",
  curiosidad: "Curiosidad",
  brevedad: "Brevedad",
};

export type PuntajeGancho = {
  total: number;
  propiedades: Record<Propiedad, { puntos: number; motivo: string }>;
  sugerencias: string[];
  palabras: number;
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const palabrasDe = (t: string) => t.split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p));

const NUMEROS = /\b(un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|veinte|treinta|cien|cientos?|mil|miles|millon|millones|billon|billones|mitad|doble|triple)\b/;
const UNIDADES = /(\$|€|%|\b(pesos|dolares|euros|usd|cop|mxn|anos|meses|dias|horas|minutos|segundos|veces|por ciento)\b)/;
const SEGUNDA_PERSONA = /\b(tu|tus|tuyo|tuya|tuyos|tuyas|te|ti|contigo|usted|ustedes|vos|pagas|pierdes|sabes|crees|compras|usas|tienes|ganas|haces|puedes|vas|estas|eres|gastas|ahorras|imagina|mira|piensa|revisa|abres)\b/g;
const RIESGO = /\b(pierd\w*|perder|perdida\w*|pag(as|an|ar|o)|cobr\w*|cuest\w*|cost\w*|deud\w*|trampa\w*|error\w*|estaf\w*|rob\w*|quiebr\w*|multa\w*|interes(es)?|comision\w*|riesgo\w*|peligr\w*|caro|cara|gratis|oculto\w*|a tu costa|sin saberlo|te estan)\b/g;
const PREGUNTA = /\b(por que|como|que|quien|cuanto|cuantos|cuanta|donde|cuando)\b/;
const BUCLE_ABIERTO = /(lo que nadie|nadie te|la verdad|en realidad|realmente|no es lo que|el truco|el secreto|asi es como|te cuento|descubr\w*|resulta que|lo que no sabes|nadie habla)/g;
const CONTRASTE = /\b(pero|sin embargo|aunque|en cambio)\b/;

function especificidad(texto: string, t: string): { puntos: number; motivo: string } {
  let p = 0;
  const motivos: string[] = [];
  if (/\d/.test(texto) || NUMEROS.test(t)) {
    p += 8;
    motivos.push("lleva una cifra");
  }
  if (UNIDADES.test(t)) {
    p += 6;
    motivos.push("con unidad (dinero, tiempo, %)");
  }
  const propios = palabrasDe(texto)
    .slice(1)
    .filter((w) => /^[«"¿¡(]?[A-ZÁÉÍÓÚÑ][\p{L}]{1,}/u.test(w));
  if (propios.length > 0) {
    p += 6;
    motivos.push("nombra algo concreto");
  }
  return { puntos: Math.min(20, p), motivo: motivos.join(", ") || "sin cifras ni nombres concretos" };
}

function contar(re: RegExp, t: string) {
  return (t.match(re) ?? []).length;
}

export function puntuarGancho(texto: string): PuntajeGancho {
  const limpio = texto.trim();
  const t = norm(limpio);
  const n = palabrasDe(limpio).length;

  const esp = especificidad(limpio, t);

  const segunda = contar(SEGUNDA_PERSONA, t);
  const dirigido = {
    puntos: segunda === 0 ? 0 : segunda === 1 ? 12 : 20,
    motivo: segunda === 0 ? "no le habla a quien mira" : `le habla a quien mira (${segunda} marca${segunda > 1 ? "s" : ""})`,
  };

  const riesgos = contar(RIESGO, t);
  const riesgo = {
    puntos: Math.min(20, riesgos * 8),
    motivo: riesgos === 0 ? "no hay nada en juego (dinero, error, pérdida)" : `hay algo en juego (${riesgos})`,
  };

  let cur = 0;
  const motivosCur: string[] = [];
  if (limpio.includes("?")) {
    cur += 6;
    motivosCur.push("pregunta");
  }
  if (PREGUNTA.test(t)) {
    cur += 6;
    motivosCur.push("interrogativo");
  }
  const bucles = contar(BUCLE_ABIERTO, t);
  if (bucles) {
    cur += 8 * bucles;
    motivosCur.push("abre un bucle");
  }
  if (CONTRASTE.test(t)) {
    cur += 4;
    motivosCur.push("contraste");
  }
  const curiosidad = { puntos: Math.min(20, cur), motivo: motivosCur.join(", ") || "no deja una pregunta abierta" };

  const brevedad =
    n === 0
      ? { puntos: 0, motivo: "vacío" }
      : n < 4
        ? { puntos: 10, motivo: `${n} palabras: demasiado corto para enganchar` }
        : n <= 12
          ? { puntos: 20, motivo: `${n} palabras` }
          : { puntos: Math.max(0, Math.round(20 - (n - 12) * 1.5)), motivo: `${n} palabras: recórtalo a 12 o menos` };

  const propiedades = { especificidad: esp, dirigido, riesgo, curiosidad, brevedad };
  const total = Object.values(propiedades).reduce((a, p) => a + p.puntos, 0);

  const SUGERENCIA: Record<Propiedad, string> = {
    especificidad: "Agrega una cifra concreta (con su fuente) o un nombre propio.",
    dirigido: "Háblale directo a quien mira: «tú», «tu dinero», «pagas».",
    riesgo: "Muestra qué se pierde o quién cobra.",
    curiosidad: "Deja una pregunta abierta que el video responda.",
    brevedad: "Acórtalo: 12 palabras o menos.",
  };
  const sugerencias = (Object.keys(propiedades) as Propiedad[])
    .filter((k) => propiedades[k].puntos < 12)
    .map((k) => SUGERENCIA[k]);

  return { total, propiedades, sugerencias, palabras: n };
}

/** Objetivo del canal (reglas.objetivoGancho) o el valor por defecto. */
export function objetivoGancho(reglas: unknown): number {
  const v = (reglas as { objetivoGancho?: unknown } | null)?.objetivoGancho;
  return typeof v === "number" && v > 0 && v <= 100 ? v : OBJETIVO_GANCHO_POR_DEFECTO;
}

export function ganchoAprobado(
  video: { scoreGancho: number | null; ganchoForzadoEn: Date | null },
  objetivo: number,
): boolean {
  return Boolean(video.ganchoForzadoEn) || (video.scoreGancho !== null && video.scoreGancho >= objetivo);
}
