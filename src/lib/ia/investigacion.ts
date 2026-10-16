// Investigación semanal de referencias con la API de Claude y búsqueda web.
// Devuelve un informe en Markdown con fuentes enlazadas. vidIQ no tiene API
// para el panel: si el equipo pega datos exportados de vidIQ, se incluyen como
// insumo. Regla: ninguna cifra sin su enlace.

import Anthropic from "@anthropic-ai/sdk";
import { costoDe, MODELO_GUION, type Uso } from "./guion";
import { ErrorGenerador } from "./guion";

export const MAX_TOKENS_INVESTIGACION = 16_000;
export const MAX_BUSQUEDAS = 8;
export const MAX_RONDAS = 4;
export const USD_POR_BUSQUEDA = 0.01; // US$ 10 por cada 1000 búsquedas

export type PedidoInvestigacion = {
  canal: { nombre: string; idioma: string; pilares: string[]; voz: string[] };
  titulosRecientes: string[];
  datosVidiq: string | null;
  semana: string;
};

export function promptInvestigacion(p: PedidoInvestigacion): { system: string; usuario: string } {
  const system = [
    `Investigas referencias para el canal de YouTube «${p.canal.nombre}» (idioma «${p.canal.idioma}»). Escribe el informe en ese idioma.`,
    "Usa la búsqueda web para encontrar videos y temas recientes (últimos 30 días) del mismo nicho y público.",
    "Reglas sin excepciones:",
    "- Cada video, canal, cifra o tendencia que menciones lleva el enlace donde lo viste. Si no tienes el enlace, no lo menciones.",
    "- No inventes vistas, suscriptores ni fechas. Copia solo números que aparezcan en una fuente enlazada.",
    "- Las referencias sirven para entender qué funciona (fórmula, ángulo, formato); nunca para copiar contenido.",
  ].join("\n");
  const usuario = [
    `Semana ${p.semana}.`,
    `Pilares del canal: ${p.canal.pilares.join(" · ") || "—"}.`,
    p.titulosRecientes.length ? `Videos recientes del canal:\n${p.titulosRecientes.map((t) => `- ${t}`).join("\n")}` : "",
    p.datosVidiq ? `Datos exportados de vidIQ (insumo del equipo, úsalos y cítalos como «vidIQ»):\n${p.datosVidiq.slice(0, 20_000)}` : "",
    [
      "Entrega un informe en Markdown con estas secciones:",
      "## Tendencias de la semana (3 a 5, con enlaces)",
      "## Referencias (8 a 12 videos: título, canal, enlace y por qué funciona)",
      "## Ideas para el canal (5, cada una con su pilar, un gancho propuesto y la referencia que la inspira)",
      "## Fuentes (todos los enlaces usados)",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
  return { system, usuario };
}

/** Peor caso de costo de una investigación (para comprobar el tope antes de gastar). */
export function costoMaximoInvestigacion(promptCaracteres: number, modelo = MODELO_GUION): number {
  const porRonda = costoDe(modelo, { input_tokens: Math.ceil(promptCaracteres / 2.5) + 40_000, output_tokens: MAX_TOKENS_INVESTIGACION }).usd;
  return Math.round((porRonda * MAX_RONDAS + MAX_BUSQUEDAS * USD_POR_BUSQUEDA) * 100) / 100;
}

export type ResultadoInvestigacion = { informe: string; modelo: string; uso: Uso; busquedas: number; costo: number; estimado: boolean };
export type Investigador = (p: PedidoInvestigacion) => Promise<ResultadoInvestigacion>;

export function investigadorClaude(cliente?: Anthropic): Investigador {
  return async (pedido) => {
    if (!cliente && !process.env.ANTHROPIC_API_KEY) throw new ErrorGenerador("Falta la variable de entorno ANTHROPIC_API_KEY en el servidor.");
    const client = cliente ?? new Anthropic({ maxRetries: 3 });
    const { system, usuario } = promptInvestigacion(pedido);
    const mensajes: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content: usuario }];
    const uso: Uso = { input_tokens: 0, output_tokens: 0 };
    let busquedas = 0;
    let modelo = MODELO_GUION;

    for (let ronda = 0; ronda < MAX_RONDAS; ronda++) {
      const r = await client.beta.messages.create({
        model: MODELO_GUION,
        max_tokens: MAX_TOKENS_INVESTIGACION,
        system,
        messages: mensajes,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: MAX_BUSQUEDAS }],
        output_config: { effort: "high" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      modelo = r.model;
      uso.input_tokens += r.usage.input_tokens;
      uso.output_tokens += r.usage.output_tokens;
      busquedas += r.usage.server_tool_use?.web_search_requests ?? 0;

      if (r.stop_reason === "refusal") throw new ErrorGenerador("El modelo declinó la investigación.");
      if (r.stop_reason === "pause_turn") {
        // La búsqueda del servidor llegó a su límite de pasos: se reenvía el turno para que continúe.
        mensajes.push({ role: "assistant", content: r.content });
        continue;
      }
      if (r.stop_reason === "max_tokens") throw new ErrorGenerador("El informe quedó incompleto (límite de longitud).");
      const informe = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
      if (!informe) throw new ErrorGenerador("El modelo no devolvió texto.");
      const c = costoDe(modelo, uso);
      return { informe, modelo, uso, busquedas, costo: Math.round((c.usd + busquedas * USD_POR_BUSQUEDA) * 10_000) / 10_000, estimado: c.estimado };
    }
    throw new ErrorGenerador("La investigación no terminó dentro del número de rondas permitido.");
  };
}
