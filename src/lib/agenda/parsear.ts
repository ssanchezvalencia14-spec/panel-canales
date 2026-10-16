// Lector de agendas de publicación en Markdown (p. ej. AGENDA_PUBLICACION_*.md).
//
// Acepta dos formas habituales:
//  1. Tablas Markdown con encabezados como Fecha | Título | Pilar | Gancho.
//  2. Secciones con encabezado por video (## / ###) y líneas «Clave: valor».
// No inventa datos: lo que no se puede leer queda vacío y se reporta en `avisos`.

export type EntradaAgenda = {
  /** Fecha local "YYYY-MM-DD" o null si no se pudo leer. */
  fecha: string | null;
  titulo: string;
  pilar: string | null;
  gancho: string | null;
  notas: string | null;
};

export type ResultadoAgenda = {
  entradas: EntradaAgenda[];
  avisos: string[];
};

export type OpcionesAgenda = {
  /** Año a usar cuando la fecha no lo trae (p. ej. «lun 20 oct»). */
  anioPorDefecto?: number;
};

const MESES: Record<string, number> = {
  ene: 1, enero: 1, jan: 1,
  feb: 2, febrero: 2,
  mar: 3, marzo: 3,
  abr: 4, abril: 4, apr: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6,
  jul: 7, julio: 7,
  ago: 8, agosto: 8, aug: 8,
  sep: 9, sept: 9, septiembre: 9, setiembre: 9,
  oct: 10, octubre: 10,
  nov: 11, noviembre: 11,
  dic: 12, diciembre: 12, dec: 12,
};

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Quita formato Markdown en línea (negritas, cursivas, código, enlaces). */
export function limpiarMarkdown(texto: string): string {
  return texto
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|`)/g, "")
    .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$)/g, "$1$2")
    .replace(/^["“«]+|["”»]+$/g, "")
    .trim();
}

const dos = (n: number) => String(n).padStart(2, "0");

function fechaValida(a: number, m: number, d: number): string | null {
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) {
    return null;
  }
  return `${a}-${dos(m)}-${dos(d)}`;
}

/** Interpreta una fecha escrita en español. Devuelve "YYYY-MM-DD" o null. */
export function parsearFecha(texto: string, anioPorDefecto?: number): string | null {
  const t = normalizar(limpiarMarkdown(texto));

  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return fechaValida(+m[1], +m[2], +m[3]);

  m = /\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/.exec(t);
  if (m) {
    const anio = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : anioPorDefecto;
    return anio ? fechaValida(anio, +m[2], +m[1]) : null;
  }

  m = /\b(\d{1,2})[\s-]*(?:de\s+)?([a-z]+)\.?(?:[\s-]*(?:de|del)?\s*(\d{4}))?/.exec(t);
  if (m && MESES[m[2]] !== undefined) {
    const anio = m[3] ? +m[3] : anioPorDefecto;
    return anio ? fechaValida(anio, MESES[m[2]], +m[1]) : null;
  }
  return null;
}

type Campo = "fecha" | "titulo" | "pilar" | "gancho" | "notas";

function campoDeEncabezado(encabezado: string): Campo | null {
  const h = normalizar(limpiarMarkdown(encabezado));
  if (/^(fecha|dia|publicacion|fecha de publicacion|cuando)\b/.test(h)) return "fecha";
  if (/^(titulo|tema|video|titulo provisional|titular)\b/.test(h)) return "titulo";
  if (/^(pilar|categoria|serie|bloque)\b/.test(h)) return "pilar";
  if (/^(gancho|hook|apertura)\b/.test(h)) return "gancho";
  if (/^(notas?|observaciones|comentarios?)\b/.test(h)) return "notas";
  return null;
}

function celdas(linea: string): string[] {
  return linea
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

const esSeparador = (linea: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(linea);

function vacioANull(v: string | undefined): string | null {
  const limpio = v ? limpiarMarkdown(v) : "";
  return limpio && limpio !== "-" && limpio !== "—" ? limpio : null;
}

function leerTablas(lineas: string[], op: OpcionesAgenda, avisos: string[]): EntradaAgenda[] {
  const entradas: EntradaAgenda[] = [];
  for (let i = 0; i + 1 < lineas.length; i++) {
    if (!lineas[i].includes("|") || !esSeparador(lineas[i + 1])) continue;
    const mapa = celdas(lineas[i]).map(campoDeEncabezado);
    if (!mapa.includes("titulo")) continue;

    let j = i + 2;
    for (; j < lineas.length && lineas[j].includes("|"); j++) {
      const fila = celdas(lineas[j]);
      const valor = (campo: Campo) => {
        const k = mapa.indexOf(campo);
        return k >= 0 ? fila[k] : undefined;
      };
      const titulo = vacioANull(valor("titulo"));
      if (!titulo) continue;
      const textoFecha = valor("fecha");
      const fecha = textoFecha ? parsearFecha(textoFecha, op.anioPorDefecto) : null;
      if (textoFecha && !fecha) avisos.push(`Fecha ilegible «${textoFecha}» en «${titulo}».`);
      entradas.push({
        fecha,
        titulo,
        pilar: vacioANull(valor("pilar")),
        gancho: vacioANull(valor("gancho")),
        notas: vacioANull(valor("notas")),
      });
    }
    i = j - 1;
  }
  return entradas;
}

function leerSecciones(lineas: string[], op: OpcionesAgenda, avisos: string[]): EntradaAgenda[] {
  const entradas: EntradaAgenda[] = [];
  let actual: (EntradaAgenda & { textoFecha?: string }) | null = null;

  const cerrar = () => {
    if (!actual) return;
    if (actual.textoFecha && !actual.fecha) {
      avisos.push(`Fecha ilegible «${actual.textoFecha}» en «${actual.titulo}».`);
    }
    const { textoFecha: _omitida, ...entrada } = actual;
    void _omitida;
    entradas.push(entrada);
    actual = null;
  };

  for (const linea of lineas) {
    const h = /^#{2,4}\s+(.+)$/.exec(linea);
    if (h) {
      cerrar();
      const encabezado = limpiarMarkdown(h[1]);
      // «Video 3 · Título», «3. Título», «Lun 20 oct — Título»
      const esVideo = /^(video|episodio|semana)?\s*\d+\b/i.test(normalizar(encabezado))
        || parsearFecha(encabezado, op.anioPorDefecto) !== null;
      if (!esVideo) continue;
      const titulo = encabezado
        .replace(/^(video|episodio)\s*\d+\s*[:.·—–-]?\s*/i, "")
        .replace(/^\d+\s*[.)·—–-]\s*/, "")
        .trim();
      const fecha = parsearFecha(encabezado, op.anioPorDefecto);
      actual = { fecha, titulo, pilar: null, gancho: null, notas: null };
      continue;
    }
    if (!actual) continue;
    const kv = /^\s*[-*]?\s*(?:\*\*)?([^:*]{2,40}?)(?:\*\*)?\s*:\s*(.+)$/.exec(linea);
    if (!kv) continue;
    const campo = campoDeEncabezado(kv[1]);
    const valor = vacioANull(kv[2]);
    if (!campo || !valor) continue;
    if (campo === "fecha") {
      actual.textoFecha = kv[2];
      actual.fecha = parsearFecha(kv[2], op.anioPorDefecto);
    } else if (campo === "titulo") {
      actual.titulo = valor;
    } else {
      actual[campo] = valor;
    }
  }
  cerrar();

  // Quita fechas sobrantes del título si la fecha venía en el encabezado.
  return entradas
    .map((e) => ({
      ...e,
      titulo: e.titulo.replace(/^[^—–·|]*\d{1,2}[^—–·|]*[—–·|]\s*/, (pref) =>
        parsearFecha(pref, op.anioPorDefecto) ? "" : pref,
      ).trim(),
    }))
    .filter((e) => e.titulo.length > 0);
}

export function parsearAgenda(markdown: string, op: OpcionesAgenda = {}): ResultadoAgenda {
  const avisos: string[] = [];
  const lineas = markdown.replace(/\r\n?/g, "\n").split("\n");

  let entradas = leerTablas(lineas, op, avisos);
  if (entradas.length === 0) entradas = leerSecciones(lineas, op, avisos);

  for (const e of entradas) {
    if (!e.fecha) avisos.push(`«${e.titulo}» no tiene fecha de publicación.`);
  }
  if (entradas.length === 0) {
    avisos.push(
      "No se encontraron videos. Se espera una tabla con columna «Título» o secciones «## Video N · Título».",
    );
  }
  return { entradas, avisos: [...new Set(avisos)] };
}
