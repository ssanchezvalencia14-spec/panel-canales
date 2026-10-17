// Modo chat (sin API): el panel arma las instrucciones completas, el equipo las
// pega en su chat de IA (claude.ai con su suscripción, u otro) y pega la
// respuesta de vuelta. Sin claves ni costo en el panel. Las mismas reglas que
// con la API: el guion sale del formato del canal y toda cifra va al checklist.

import { ErrorGenerador, esquemaBorrador, type Borrador } from "./guion";

export const MODELO_CHAT = "chat externo";

export const MARCAS = { guion: "===GUION===", cifras: "===CIFRAS===", notas: "===NOTAS===", fin: "===FIN===" } as const;

/** Instrucciones para pegar en un chat: las del canal más el formato de respuesta que el panel sabe leer. */
export function promptParaChat(p: { system: string; usuario: string }, formato: "guion" | "investigacion"): string {
  const salida =
    formato === "guion"
      ? [
          "FORMATO DE RESPUESTA (obligatorio, el panel lo lee automáticamente):",
          "Responde SOLO con estas cuatro marcas, cada una en su propia línea, y nada antes ni después:",
          MARCAS.guion,
          "(el guion completo en Markdown)",
          MARCAS.cifras,
          "- afirmación o [CIFRA: …] | fuente pública sugerida (o vacío)",
          "(una línea por cifra; si no hay ninguna, escribe: - ninguna)",
          MARCAS.notas,
          "(dudas o advertencias para el equipo; vacío si no hay)",
          MARCAS.fin,
        ].join("\n")
      : [
          "FORMATO DE RESPUESTA:",
          "Usa la búsqueda web de tu chat. Responde solo con el informe en Markdown, con las secciones pedidas y los enlaces completos (https://…).",
        ].join("\n");
  return [`# Instrucciones\n\n${p.system}`, `# Pedido\n\n${p.usuario}`, `# ${salida}`].join("\n\n");
}

const sinBloqueCodigo = (t: string) => t.replace(/^\s*```[a-z]*\s*\n/i, "").replace(/\n```\s*$/, "");

/** Lee la respuesta pegada: el formato de marcas o, si el chat devolvió JSON, el mismo esquema que la API. */
export function leerRespuestaGuion(texto: string): Borrador {
  const t = sinBloqueCodigo(texto.replace(/\r\n/g, "\n").trim());
  if (!t) throw new ErrorGenerador("Pega la respuesta del chat.");

  if (t.startsWith("{")) {
    try {
      return esquemaBorrador.parse(JSON.parse(t));
    } catch {
      throw new ErrorGenerador("La respuesta parece JSON pero no tiene los campos guion, cifras y notas.");
    }
  }

  const i = t.indexOf(MARCAS.guion);
  const c = t.indexOf(MARCAS.cifras);
  if (i < 0 || c < 0 || c < i) {
    throw new ErrorGenerador(`No encuentro las marcas ${MARCAS.guion} y ${MARCAS.cifras}. Copia la respuesta completa del chat, o pídele que respete el formato.`);
  }
  const n = t.indexOf(MARCAS.notas, c);
  const f = t.indexOf(MARCAS.fin, c);
  const finCifras = [n, f].filter((x) => x > c).sort((a, b) => a - b)[0] ?? t.length;
  const guion = t.slice(i + MARCAS.guion.length, c).trim();
  if (guion.split(/\s+/).length < 30) throw new ErrorGenerador("El guion pegado está vacío o es demasiado corto.");

  const cifras = t
    .slice(c + MARCAS.cifras.length, finCifras)
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((l) => l && !/^(ninguna|ninguno|n\/a|—|-)$/i.test(l))
    .map((l) => {
      const [afirmacion, ...resto] = l.split("|");
      return { afirmacion: afirmacion.trim().slice(0, 1500), fuente_sugerida: resto.join("|").trim().slice(0, 400) };
    })
    .filter((x) => x.afirmacion);

  const notas = n >= 0 ? t.slice(n + MARCAS.notas.length, f > n ? f : t.length).trim() : "";
  return { guion, cifras, notas };
}

/** Informe de investigación pegado: Markdown con al menos un enlace. */
export function leerRespuestaInvestigacion(texto: string): string {
  const t = sinBloqueCodigo(texto.replace(/\r\n/g, "\n").trim());
  if (t.length < 200) throw new ErrorGenerador("El informe pegado está vacío o es demasiado corto.");
  if (!/https?:\/\/\S+/.test(t)) throw new ErrorGenerador("El informe no trae enlaces. La regla del panel: ninguna referencia ni cifra sin su enlace.");
  return t.slice(0, 100_000);
}
