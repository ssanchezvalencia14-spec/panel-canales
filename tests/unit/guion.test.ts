import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { construirPrompt, costoDe, costoMaximo, ErrorGenerador, generadorClaude, MODELO_GUION, type PedidoGuion } from "@/lib/ia/guion";
import { esEnlaceDrive, piezasDeCanal } from "@/server/produccion";

const pedido: PedidoGuion = {
  canal: {
    nombre: "Canal X",
    idioma: "es",
    pilares: ["P1"],
    voz: ["Frases cortas."],
    estructura: ["Escena", "Bloques"],
    extension: "900 palabras",
  },
  video: { titulo: "Título de prueba", pilar: "P1", gancho: "¿Por qué pagas de más?", textoMiniatura: null, notas: "Nota del equipo" },
};

function clienteFalso(respuesta: Record<string, unknown>, capturar?: (params: Record<string, unknown>) => void) {
  return {
    beta: {
      messages: {
        stream: (params: Record<string, unknown>) => {
          capturar?.(params);
          return { finalMessage: async () => respuesta };
        },
      },
    },
  } as unknown as Anthropic;
}

const respuestaOk = (texto: string, extra: Record<string, unknown> = {}) => ({
  model: MODELO_GUION,
  stop_reason: "end_turn",
  content: [{ type: "text", text: texto }],
  usage: { input_tokens: 1000, output_tokens: 3000 },
  ...extra,
});

describe("prompt del guion", () => {
  it("usa la voz, la estructura y la extensión del canal, y prohíbe inventar cifras", () => {
    const { system, usuario } = construirPrompt(pedido);
    expect(system).toContain("«Canal X»");
    expect(system).toContain("- Frases cortas.");
    expect(system).toContain("- Escena");
    expect(system).toContain("900 palabras");
    expect(system).toMatch(/Nunca inventes cifras/);
    expect(system).toContain("[CIFRA:");
    expect(usuario).toContain("Gancho aprobado (úsalo como primera frase): ¿Por qué pagas de más?");
    expect(usuario).toContain("Nota del equipo");
  });

  it("calcula costo real y máximo", () => {
    expect(costoDe("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toEqual({ usd: 24, estimado: false });
    expect(costoDe("modelo-desconocido", { input_tokens: 0, output_tokens: 1_000_000 }).estimado).toBe(true);
    expect(costoMaximo(2500)).toBeCloseTo(0.644, 3);
  });
});

describe("generador con Claude (cliente simulado)", () => {
  it("pide salida estructurada, esfuerzo alto y respaldo ante rechazos", async () => {
    let params: Record<string, unknown> = {};
    const json = JSON.stringify({ guion: "# Guion", cifras: [{ afirmacion: "37 dólares", fuente_sugerida: "" }], notas: "" });
    const r = await generadorClaude(clienteFalso(respuestaOk(json), (p) => (params = p)))(pedido);
    expect(params).toMatchObject({ model: MODELO_GUION, fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
    expect((params.output_config as { effort: string; format: { type: string } }).effort).toBe("high");
    expect((params.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    expect(r.borrador.cifras).toHaveLength(1);
    expect(r.fallback).toBe(false);
  });

  it("detecta el respaldo y falla con mensajes claros", async () => {
    const json = JSON.stringify({ guion: "x", cifras: [], notas: "" });
    const conRespaldo = respuestaOk(json, { usage: { input_tokens: 1, output_tokens: 1, iterations: [{ type: "fallback_message" }] } });
    expect((await generadorClaude(clienteFalso(conRespaldo))(pedido)).fallback).toBe(true);

    await expect(generadorClaude(clienteFalso(respuestaOk("", { stop_reason: "refusal" })))(pedido)).rejects.toThrow(/declinó/);
    await expect(generadorClaude(clienteFalso(respuestaOk("{", { stop_reason: "max_tokens" })))(pedido)).rejects.toThrow(/incompleto/);
    await expect(generadorClaude(clienteFalso(respuestaOk("no es json")))(pedido)).rejects.toBeInstanceOf(ErrorGenerador);
  });
});

describe("piezas y enlaces de salida", () => {
  it("lee las piezas por video de las reglas del canal", () => {
    expect(piezasDeCanal({ piezasPorVideo: { largo: 1, tiktok: 4, shorts: 3 } })).toEqual({ largo: 1, tiktok: 4, shorts: 3 });
    expect(piezasDeCanal({})).toEqual({ largo: 1, tiktok: 0, shorts: 0 });
  });

  it("solo acepta enlaces https de Google Drive", () => {
    expect(esEnlaceDrive("https://drive.google.com/file/d/abc/view")).toBe(true);
    expect(esEnlaceDrive("https://docs.google.com/document/d/abc")).toBe(true);
    expect(esEnlaceDrive("http://drive.google.com/file/d/abc")).toBe(false);
    expect(esEnlaceDrive("https://drive.google.com.malo.com/x")).toBe(false);
    expect(esEnlaceDrive("no")).toBe(false);
  });
});
