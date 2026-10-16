// Revisión de título y miniatura como pareja.
//
// Reimplementación propia de la idea de title_es.py descrita en la skill del
// canal (título ≤ 60 caracteres, lo clave en los primeros 40 para móvil, cifra,
// palabras vagas, miniatura ≤ 3 palabras y distinta del título). No es un port
// línea a línea. Los límites salen de las reglas del canal si las define.

export type Bandera = {
  codigo: "largo" | "móvil" | "sin-cifra" | "vago" | "miniatura-larga" | "miniatura-repite";
  mensaje: string;
  /** «error» impide guardar como listo; «aviso» solo informa. */
  gravedad: "error" | "aviso";
};

export type RevisionTitulo = { longitud: number; banderas: Bandera[]; ok: boolean };

export type LimitesTitulo = { maximo: number; movil: number; palabrasMiniatura: number };

export const LIMITES_POR_DEFECTO: LimitesTitulo = { maximo: 60, movil: 40, palabrasMiniatura: 3 };

export function limitesDeCanal(reglas: unknown): LimitesTitulo {
  const r = (reglas as { tituloMax?: unknown; tituloMovil?: unknown; miniaturaPalabras?: unknown } | null) ?? {};
  const num = (v: unknown, d: number) => (typeof v === "number" && v > 0 ? v : d);
  return {
    maximo: num(r.tituloMax, LIMITES_POR_DEFECTO.maximo),
    movil: num(r.tituloMovil, LIMITES_POR_DEFECTO.movil),
    palabrasMiniatura: num(r.miniaturaPalabras, LIMITES_POR_DEFECTO.palabrasMiniatura),
  };
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const VAGAS = /\b(cosas?|algo|esto|increible|impactante|brutal|nunca creeras|todo lo que|lo que paso|asombros\w*|locura|epico)\b/;
const NUMEROS = /\b(uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|cien|mil|millon(es)?|billon(es)?|mitad|doble|triple)\b/;
const VACIAS = new Set([
  "el", "la", "los", "las", "un", "una", "de", "del", "y", "o", "que", "en", "a", "al", "por", "para", "con", "su", "sus",
  "tu", "tus", "es", "se", "lo", "como", "mas", "no", "si", "ya", "muy", "pero", "sin",
]);

const significativas = (t: string) =>
  norm(t)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 3 && !VACIAS.has(w));

/** Longitud en caracteres visibles (los emoji cuentan como uno). */
export const longitud = (t: string) => [...t.trim()].length;

export function revisarTitulo(titulo: string, miniatura: string | null | undefined, l: LimitesTitulo = LIMITES_POR_DEFECTO): RevisionTitulo {
  const banderas: Bandera[] = [];
  const largo = longitud(titulo);
  const t = norm(titulo);

  if (largo > l.maximo) {
    banderas.push({ codigo: "largo", gravedad: "error", mensaje: `Tiene ${largo} caracteres; el máximo es ${l.maximo}.` });
  }
  if (largo > l.movil) {
    banderas.push({
      codigo: "móvil",
      gravedad: "aviso",
      mensaje: `En móvil se corta cerca del carácter ${l.movil}: lo importante debe ir antes («${[...titulo].slice(0, l.movil).join("")}…»).`,
    });
  }
  if (!/\d/.test(titulo) && !NUMEROS.test(t)) {
    banderas.push({ codigo: "sin-cifra", gravedad: "aviso", mensaje: "No lleva cifra; una cifra concreta suele mejorar el clic." });
  }
  const vaga = VAGAS.exec(t);
  if (vaga) {
    banderas.push({ codigo: "vago", gravedad: "aviso", mensaje: `«${vaga[0]}» es vago: cámbialo por algo concreto.` });
  }

  const mini = miniatura?.trim();
  if (mini) {
    const n = mini.split(/\s+/).filter(Boolean).length;
    if (n > l.palabrasMiniatura) {
      banderas.push({ codigo: "miniatura-larga", gravedad: "aviso", mensaje: `La miniatura tiene ${n} palabras; máximo ${l.palabrasMiniatura}.` });
    }
    const delTitulo = new Set(significativas(titulo));
    const repetidas = significativas(mini).filter((w) => delTitulo.has(w));
    if (repetidas.length) {
      banderas.push({
        codigo: "miniatura-repite",
        gravedad: "aviso",
        mensaje: `La miniatura repite «${repetidas.join(", ")}» del título: deben complementarse, no duplicarse.`,
      });
    }
  }
  return { longitud: largo, banderas, ok: !banderas.some((b) => b.gravedad === "error") };
}
