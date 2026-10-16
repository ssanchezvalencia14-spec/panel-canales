// Borrador de guion con la API de Claude (ANTHROPIC_API_KEY).
//
// El prompt es genérico: la voz, la estructura y la extensión salen de las
// reglas del canal (datos), nunca del código. Claude no puede inventar cifras:
// donde haga falta un dato escribe un marcador [CIFRA: …] y lo lista con la
// fuente pública donde verificarlo. Esa lista se convierte en el checklist de
// verificación, con fuente obligatoria.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export const MODELO_GUION = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";
export const MAX_TOKENS_GUION = 32_000;

/** USD por millón de tokens [entrada, salida]. Fuente: tabla de precios de Anthropic (2026-09). */
const PRECIOS: Record<string, [number, number]> = {
  "claude-fable-5-1": [10, 50],
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
  "claude-sonnet-5-5": [2, 10],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
};

export type Uso = { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };

/** Costo en USD de una respuesta. Para modelos sin precio conocido usa el de MODELO_GUION y lo marca como estimado. */
export function costoDe(modelo: string, uso: Uso): { usd: number; estimado: boolean } {
  const precio = PRECIOS[modelo] ?? PRECIOS[MODELO_GUION] ?? PRECIOS["claude-opus-5-5"];
  const entrada = uso.input_tokens + (uso.cache_creation_input_tokens ?? 0) * 1.25 + (uso.cache_read_input_tokens ?? 0) * 0.1;
  const usd = (entrada * precio[0] + uso.output_tokens * precio[1]) / 1_000_000;
  return { usd: Math.round(usd * 10_000) / 10_000, estimado: !(modelo in PRECIOS) };
}

/** Tope superior del costo de una llamada, para comprobar el tope de gasto antes de hacerla. */
export function costoMaximo(promptCaracteres: number, modelo = MODELO_GUION): number {
  return costoDe(modelo, { input_tokens: Math.ceil(promptCaracteres / 2.5), output_tokens: MAX_TOKENS_GUION }).usd;
}

export const esquemaBorrador = z.object({
  guion: z.string().describe("El guion completo en Markdown, con lo que se ve en pantalla marcado en cada bloque."),
  cifras: z
    .array(
      z.object({
        afirmacion: z.string().describe("La cifra o el dato tal como aparece (o el marcador [CIFRA: …])."),
        fuente_sugerida: z.string().describe("Fuente pública donde verificarlo; vacío si no se conoce."),
      }),
    )
    .describe("Toda cifra, fecha o dato sobre personas o empresas reales que hay que verificar."),
  notas: z.string().describe("Dudas o advertencias para el equipo; vacío si no hay."),
});

export type Borrador = z.infer<typeof esquemaBorrador>;

export type PedidoGuion = {
  canal: { nombre: string; idioma: string; pilares: string[]; voz: string[]; estructura: string[]; extension: string | null };
  video: { titulo: string; pilar: string | null; gancho: string | null; textoMiniatura: string | null; notas: string | null };
};

export function construirPrompt(p: PedidoGuion): { system: string; usuario: string } {
  const lista = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");
  const system = [
    `Escribes borradores de guion para el canal de YouTube «${p.canal.nombre}». Escribe en el idioma «${p.canal.idioma}».`,
    "Un borrador es un insumo para el equipo: una persona lo revisa, verifica las cifras y lo aprueba antes de producirlo.",
    p.canal.voz.length ? `Reglas de voz del canal:\n${lista(p.canal.voz)}` : "",
    p.canal.estructura.length ? `Estructura del guion:\n${lista(p.canal.estructura)}` : "",
    p.canal.extension ? `Extensión: ${p.canal.extension}.` : "",
    [
      "Reglas sobre datos, sin excepciones:",
      "- Nunca inventes cifras, fechas, resultados, citas ni nombres de fuentes.",
      "- Si una idea necesita un dato que no tienes con certeza, escribe en su lugar el marcador [CIFRA: qué dato hace falta].",
      "- Toda cifra o dato sobre personas o empresas reales, incluidos los que creas conocer, va a la lista «cifras» con la fuente pública donde se puede verificar (o vacía si no sabes cuál).",
      "- No des consejos financieros personalizados ni instrucciones para actividades ilegales.",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  const usuario = [
    `Título: ${p.video.titulo}`,
    p.video.pilar ? `Pilar: ${p.video.pilar}` : "",
    p.video.gancho ? `Gancho aprobado (úsalo como primera frase): ${p.video.gancho}` : "",
    p.video.textoMiniatura ? `Texto de la miniatura: ${p.video.textoMiniatura}` : "",
    p.video.notas ? `Notas del equipo: ${p.video.notas}` : "",
    "Escribe el borrador completo.",
  ]
    .filter(Boolean)
    .join("\n");
  return { system, usuario };
}

export type ResultadoGenerador = { borrador: Borrador; modelo: string; uso: Uso; fallback: boolean };
export type Generador = (p: PedidoGuion) => Promise<ResultadoGenerador>;

export class ErrorGenerador extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorGenerador";
  }
}

/** Generador real con la API de Claude. Si no hay clave, falla con un mensaje claro. */
export function generadorClaude(cliente?: Anthropic): Generador {
  return async (pedido) => {
    if (!cliente && !process.env.ANTHROPIC_API_KEY) {
      throw new ErrorGenerador("Falta la variable de entorno ANTHROPIC_API_KEY en el servidor.");
    }
    const client = cliente ?? new Anthropic({ maxRetries: 3 });
    const { system, usuario } = construirPrompt(pedido);
    const stream = client.beta.messages.stream({
      model: MODELO_GUION,
      max_tokens: MAX_TOKENS_GUION,
      system,
      messages: [{ role: "user", content: usuario }],
      output_config: { effort: "high", format: betaZodOutputFormat(esquemaBorrador) },
      // Si un clasificador de seguridad declina, la API reintenta con el modelo de respaldo recomendado.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    const msg = await stream.finalMessage();

    if (msg.stop_reason === "refusal") {
      throw new ErrorGenerador("El modelo declinó generar este guion. Revisa el título y las notas y vuelve a intentarlo.");
    }
    if (msg.stop_reason === "max_tokens") {
      throw new ErrorGenerador("El borrador quedó incompleto (límite de longitud). Vuelve a intentarlo.");
    }
    const texto = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let borrador: Borrador;
    try {
      borrador = esquemaBorrador.parse(JSON.parse(texto));
    } catch {
      throw new ErrorGenerador("La respuesta del modelo no tuvo el formato esperado. Vuelve a intentarlo.");
    }
    const fallback = (msg.usage.iterations ?? []).some((it: { type?: string }) => it.type === "fallback_message");
    return { borrador, modelo: msg.model, uso: msg.usage, fallback };
  };
}
