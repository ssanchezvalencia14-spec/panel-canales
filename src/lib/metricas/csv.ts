// Lectura de CSV de métricas (exportaciones de YouTube Studio, TikTok Studio o
// una hoja propia). Los encabezados se reconocen en español e inglés.
// No inventa valores: una celda vacía o ilegible queda en null.

export type CampoMetrica =
  | "referencia"
  | "titulo"
  | "fecha"
  | "vistas"
  | "retencion"
  | "ctr"
  | "likes"
  | "comentarios"
  | "compartidos"
  | "suscriptores";

export type FilaMetrica = {
  /** Enlace o id del video en la plataforma. */
  referencia: string | null;
  /** Título, para emparejar cuando no hay enlace. */
  titulo: string | null;
  fecha: string | null;
  vistas: number | null;
  retencion: number | null;
  ctr: number | null;
  likes: number | null;
  comentarios: number | null;
  compartidos: number | null;
  suscriptores: number | null;
};

export type ResultadoCsv = { filas: FilaMetrica[]; avisos: string[]; columnas: Partial<Record<CampoMetrica, string>> };

/** Separa un CSV respetando comillas. Detecta «,», «;» o tabulador. */
export function leerCsv(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const primera = limpio.split("\n", 1)[0] ?? "";
  const sep = [";", "\t", ","].reduce((mejor, s) => (contar(primera, s) > contar(primera, mejor) ? s : mejor), ",");

  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) {
      fila.push(celda);
      celda = "";
    } else if (c === "\n") {
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += c;
  }
  if (celda !== "" || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((x) => x.trim() !== ""));
}

function contar(texto: string, sub: string): number {
  return texto.split(sub).length - 1;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// Orden importa: lo más específico primero.
const ALIAS: [CampoMetrica, RegExp][] = [
  ["ctr", /(click|clic).*(impres|through|rate)|^ctr\b|porcentaje de clics/],
  ["retencion", /(porcentaje|percentage|%).*(visto|viewed|reproduc)|retencion|retention|average percentage/],
  ["referencia", /^(video|content|contenido)$|enlace|link|url|^id( de| del)? video|video id/],
  ["titulo", /titulo|title/],
  // La fecha de la foto, no la de publicación del video.
  ["fecha", /^(fecha|date|dia|day)\b(?!.*(publica|publish))/],
  ["suscriptores", /suscript|subscri/],
  ["vistas", /^(vistas|views|visualizaciones|reproducciones|video views|plays)\b/],
  ["likes", /^(me gusta|likes?)\b/],
  ["comentarios", /^(comentarios|comments)\b/],
  ["compartidos", /compartid|shares?\b/],
];

export function campoDeColumna(encabezado: string): CampoMetrica | null {
  const h = norm(encabezado);
  return ALIAS.find(([, re]) => re.test(h))?.[0] ?? null;
}

/**
 * Número escrito con separadores de miles o decimales en cualquier convención:
 * «1.234», «1,234», «12,5», «12.5 %», «1 234». Los enteros nunca tienen decimales.
 */
export function leerNumero(texto: string | undefined, entero: boolean): number | null {
  if (texto == null) return null;
  let t = texto.replace(/[%\s ]/g, "").trim();
  if (t === "" || t === "-" || t === "—") return null;
  const ultimoPunto = t.lastIndexOf(".");
  const ultimaComa = t.lastIndexOf(",");
  if (ultimoPunto >= 0 && ultimaComa >= 0) {
    const decimal = ultimoPunto > ultimaComa ? "." : ",";
    const miles = decimal === "." ? "," : ".";
    t = t.split(miles).join("").replace(decimal, ".");
  } else if (ultimoPunto >= 0 || ultimaComa >= 0) {
    const s = ultimoPunto >= 0 ? "." : ",";
    const partes = t.split(s);
    const pareceMiles = partes.length > 2 || (partes[1]?.length === 3 && entero);
    t = pareceMiles ? partes.join("") : partes.join(".");
  }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return entero ? Math.round(n) : n;
}

function leerFecha(texto: string | undefined): string | null {
  if (!texto) return null;
  const t = texto.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

const ENTEROS: CampoMetrica[] = ["vistas", "likes", "comentarios", "compartidos", "suscriptores"];

export function leerMetricasCsv(texto: string): ResultadoCsv {
  const avisos: string[] = [];
  const tabla = leerCsv(texto);
  if (tabla.length < 2) return { filas: [], avisos: ["El archivo no tiene filas de datos."], columnas: {} };

  const encabezados = tabla[0];
  const indice = new Map<CampoMetrica, number>();
  const columnas: Partial<Record<CampoMetrica, string>> = {};
  encabezados.forEach((h, i) => {
    const campo = campoDeColumna(h);
    if (campo && !indice.has(campo)) {
      indice.set(campo, i);
      columnas[campo] = h.trim();
    }
  });
  if (!indice.has("referencia") && !indice.has("titulo")) {
    return { filas: [], avisos: ["No hay columna de video (enlace, id o título) para saber a qué publicación pertenece cada fila."], columnas };
  }

  const filas: FilaMetrica[] = [];
  for (const [n, fila] of tabla.slice(1).entries()) {
    const celda = (c: CampoMetrica) => {
      const i = indice.get(c);
      return i === undefined ? undefined : fila[i];
    };
    const referencia = celda("referencia")?.trim() || null;
    const titulo = celda("titulo")?.trim() || null;
    // YouTube Studio añade una fila «Total» al principio: no es un video.
    if (!referencia && !titulo) continue;
    if (/^total$/i.test(referencia ?? titulo ?? "")) continue;

    const valores = Object.fromEntries(
      (["vistas", "retencion", "ctr", "likes", "comentarios", "compartidos", "suscriptores"] as const).map((c) => {
        const crudo = celda(c);
        const v = leerNumero(crudo, ENTEROS.includes(c));
        if (crudo && crudo.trim() && v === null) avisos.push(`Fila ${n + 2}: «${crudo}» no es un número (${c}).`);
        return [c, v];
      }),
    ) as Pick<FilaMetrica, "vistas" | "retencion" | "ctr" | "likes" | "comentarios" | "compartidos" | "suscriptores">;

    const crudoFecha = celda("fecha");
    const fecha = leerFecha(crudoFecha);
    if (crudoFecha?.trim() && !fecha) avisos.push(`Fila ${n + 2}: fecha ilegible «${crudoFecha}».`);
    filas.push({ referencia, titulo, fecha, ...valores });
  }
  return { filas, avisos, columnas };
}
