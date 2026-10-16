// Ficha de publicación de un video: textos de YouTube y TikTok.
// Los textos fijos (aviso legal, etiqueta de IA, hashtags fijos, cierre de
// TikTok, checklist) salen de reglas.ficha del canal: son datos, no código.
// Regla de TikTok: ningún enlace en descripción ni comentarios; el enlace al
// video largo va solo en la bio de la cuenta.

import { z } from "zod";

export const esquemaFicha = z.object({
  youtube: z.object({
    titulo: z.string().trim().min(1, "el título de YouTube no puede quedar vacío"),
    descripcion: z.string().trim().min(1, "la descripción de YouTube no puede quedar vacía"),
    etiquetas: z.array(z.string().trim().min(1)).max(30),
    comentarioFijado: z.string().trim(),
  }),
  tiktok: z.object({
    descripcion: z.string().trim().min(1, "la descripción de TikTok no puede quedar vacía"),
    hashtags: z.array(z.string().trim().min(2)).max(10),
    comentarioFijado: z.string().trim(),
  }),
});

export type Ficha = z.infer<typeof esquemaFicha>;

export type ConfigFicha = {
  avisoLegal: string | null;
  etiquetaIA: string | null;
  hashtagsFijos: string[];
  cierreTiktok: string | null;
  checklistTiktok: string[];
  /** Declarar en YouTube contenido alterado o sintético realista (status.containsSyntheticMedia). */
  contenidoSintetico: boolean;
};

const CHECKLIST_POR_DEFECTO = [
  "Descargué de Drive el vertical correcto de esta parte.",
  "Pegué la descripción y los hashtags tal cual.",
  "No hay ningún enlace en la descripción ni en los comentarios.",
  "El enlace al video largo está en la bio de la cuenta.",
  "Publiqué el comentario fijado.",
];

const textos = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string" && s.trim() !== "") : []);
const texto = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);

export function configFicha(reglas: unknown): ConfigFicha {
  const f = ((reglas as { ficha?: Record<string, unknown> } | null)?.ficha ?? {}) as Record<string, unknown>;
  const checklist = textos(f.checklistTiktok);
  return {
    avisoLegal: texto(f.avisoLegal),
    etiquetaIA: texto(f.etiquetaIA),
    hashtagsFijos: textos(f.hashtagsFijos).map(normalizarHashtag),
    cierreTiktok: texto(f.cierreTiktok),
    checklistTiktok: checklist.length ? checklist : CHECKLIST_POR_DEFECTO,
    contenidoSintetico: f.contenidoSintetico === true,
  };
}

export function normalizarHashtag(h: string): string {
  const limpio = h.trim().replace(/^#+/, "").replace(/\s+/g, "");
  return limpio ? `#${limpio}` : "";
}

const RE_ENLACE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|co|io|ly|me|tv|be|gl)(\/|\b))/i;

export function tieneEnlace(t: string): boolean {
  return RE_ENLACE.test(t);
}

export type Fuente = { afirmacion: string; url: string };

/** Borrador inicial a partir del video; el equipo lo edita antes de generarlo en Drive. */
export function borradorFicha(
  video: { titulo: string; gancho: string | null; pilar: string | null },
  config: ConfigFicha,
  fuentes: Fuente[],
): Ficha {
  const lineas = [
    video.gancho ?? video.titulo,
    "",
    ...(fuentes.length ? ["Fuentes:", ...fuentes.map((f) => `- ${f.url}`), ""] : []),
    ...(config.avisoLegal ? [config.avisoLegal] : []),
    ...(config.etiquetaIA ? [config.etiquetaIA] : []),
  ];
  return {
    youtube: {
      titulo: video.titulo,
      descripcion: lineas.join("\n").trim(),
      etiquetas: video.pilar ? [video.pilar] : [],
      comentarioFijado: "",
    },
    tiktok: {
      descripcion: video.titulo,
      hashtags: config.hashtagsFijos,
      comentarioFijado: config.cierreTiktok ?? "",
    },
  };
}

export type Revision = { errores: string[]; avisos: string[] };

export function revisarFicha(f: Ficha, config: ConfigFicha, tituloMax: number, fuentes: Fuente[]): Revision {
  const errores: string[] = [];
  const avisos: string[] = [];
  if ([...f.youtube.titulo].length > tituloMax) errores.push(`El título de YouTube pasa de ${tituloMax} caracteres.`);
  if (f.youtube.descripcion.length > 5000) errores.push("La descripción de YouTube pasa de 5000 caracteres (límite de YouTube).");
  if (/[<>]/.test(f.youtube.titulo + f.youtube.descripcion)) errores.push("YouTube no acepta los caracteres < ni > en título o descripción.");
  if (tieneEnlace(f.tiktok.descripcion)) errores.push("La descripción de TikTok tiene un enlace: en TikTok el enlace va solo en la bio.");
  if (tieneEnlace(f.tiktok.comentarioFijado)) errores.push("El comentario fijado de TikTok tiene un enlace: en TikTok el enlace va solo en la bio.");
  if (f.tiktok.hashtags.some((h) => !/^#[\p{L}\p{N}_]+$/u.test(h))) errores.push("Cada hashtag debe empezar con # y no tener espacios.");

  for (const fijo of config.hashtagsFijos) {
    if (!f.tiktok.hashtags.includes(fijo)) avisos.push(`Falta el hashtag fijo del canal ${fijo}.`);
  }
  if (f.tiktok.hashtags.length < 4 || f.tiktok.hashtags.length > 5) avisos.push("En TikTok se recomiendan 4 o 5 hashtags.");
  if (config.avisoLegal && !f.youtube.descripcion.includes(config.avisoLegal)) avisos.push("La descripción de YouTube no incluye el aviso legal del canal.");
  if (config.etiquetaIA && !f.youtube.descripcion.includes(config.etiquetaIA)) avisos.push("La descripción de YouTube no incluye la etiqueta de contenido con IA.");
  for (const fu of fuentes) {
    if (!f.youtube.descripcion.includes(fu.url)) avisos.push(`La descripción de YouTube no cita la fuente ${fu.url}.`);
  }
  if (!f.youtube.comentarioFijado) avisos.push("Falta el comentario fijado de YouTube.");
  return { errores, avisos };
}

/** Texto listo para copiar de cada parte de TikTok. */
export function textosTiktok(f: Ficha, partes: number): { parte: number; descripcion: string; comentario: string }[] {
  return Array.from({ length: Math.max(partes, 1) }, (_, i) => ({
    parte: i + 1,
    descripcion: [partes > 1 ? `PARTE ${i + 1}/${partes} · ${f.tiktok.descripcion}` : f.tiktok.descripcion, "", f.tiktok.hashtags.join(" ")]
      .join("\n")
      .trim(),
    comentario: f.tiktok.comentarioFijado,
  }));
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const parrafos = (t: string) => esc(t).split("\n").join("<br>");

/** Documento de la ficha (HTML que Drive convierte en Google Doc). */
export function htmlFicha(datos: {
  canal: string;
  video: string;
  publicacion: string | null;
  ficha: Ficha;
  config: ConfigFicha;
  partesTiktok: number;
  enlaceYoutube: string | null;
  archivos: { tipo: string; url: string }[];
}): string {
  const { ficha: f } = datos;
  const tt = textosTiktok(f, datos.partesTiktok);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(datos.video)}</title></head><body>
<h1>Ficha de publicación · ${esc(datos.video)}</h1>
<p>Canal: ${esc(datos.canal)}${datos.publicacion ? ` · Publicación prevista: ${esc(datos.publicacion)}` : ""}</p>
<h2>YouTube</h2>
<p><b>Título</b><br>${esc(f.youtube.titulo)}</p>
<p><b>Descripción</b><br>${parrafos(f.youtube.descripcion)}</p>
<p><b>Etiquetas</b><br>${esc(f.youtube.etiquetas.join(", ") || "—")}</p>
<p><b>Comentario fijado</b><br>${parrafos(f.youtube.comentarioFijado || "—")}</p>
${datos.config.contenidoSintetico ? "<p><b>Contenido alterado o sintético:</b> se declara en YouTube.</p>" : ""}
<h2>TikTok</h2>
<p><b>Regla:</b> sin enlaces en la descripción ni en los comentarios. El enlace al video completo va solo en la bio${datos.enlaceYoutube ? `: ${esc(datos.enlaceYoutube)}` : ""}.</p>
${tt.map((p) => `<h3>Parte ${p.parte}</h3><p><b>Descripción</b><br>${parrafos(p.descripcion)}</p><p><b>Comentario fijado</b><br>${parrafos(p.comentario || "—")}</p>`).join("\n")}
<h3>Checklist antes de publicar cada parte</h3>
<ul>${datos.config.checklistTiktok.map((c) => `<li>☐ ${esc(c)}</li>`).join("")}</ul>
${datos.archivos.length ? `<h2>Archivos</h2><ul>${datos.archivos.map((a) => `<li>${esc(a.tipo)}: ${esc(a.url)}</li>`).join("")}</ul>` : ""}
<p><i>Generado por el panel. Nada se publica sin aprobación humana.</i></p>
</body></html>`;
}
