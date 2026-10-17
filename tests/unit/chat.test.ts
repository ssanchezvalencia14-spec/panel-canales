// Modo chat (sin API): instrucciones para pegar y lectura de la respuesta pegada.

import { describe, expect, it } from "vitest";
import { leerRespuestaGuion, leerRespuestaInvestigacion, MARCAS, promptParaChat } from "@/lib/ia/chat";
import { construirPrompt } from "@/lib/ia/guion";

const pedido = {
  canal: { nombre: "Canal X", idioma: "es", pilares: ["P1"], voz: ["Frases cortas."], estructura: ["Gancho primero."], extension: "1000 palabras" },
  video: { titulo: "Por qué el banco cobra", pilar: "P1", gancho: "¿Sabes cuánto pagas?", textoMiniatura: null, notas: null },
};
const guionLargo = Array.from({ length: 40 }, (_, i) => `palabra${i}`).join(" ");

describe("instrucciones para el chat", () => {
  it("llevan las reglas del canal, el pedido y el formato de respuesta", () => {
    const t = promptParaChat(construirPrompt(pedido), "guion");
    expect(t).toContain("Frases cortas.");
    expect(t).toContain("¿Sabes cuánto pagas?");
    expect(t).toContain("Nunca inventes cifras");
    for (const m of Object.values(MARCAS)) expect(t).toContain(m);
  });
});

describe("respuesta de guion pegada", () => {
  it("lee el formato de marcas, aunque venga con texto o bloque de código alrededor", () => {
    const r = leerRespuestaGuion(
      [
        "```",
        MARCAS.guion,
        `# Título\n\n${guionLargo} [CIFRA: comisión media]`,
        MARCAS.cifras,
        "- [CIFRA: comisión media] | Superintendencia Financiera",
        "* 37 dólares al mes",
        "2. Tasa de 3% | https://banco.test/tasas | anexo",
        MARCAS.notas,
        "Revisar el dato de 2025.",
        MARCAS.fin,
        "```",
      ].join("\n"),
    );
    expect(r.guion).toMatch(/^# Título/);
    expect(r.cifras).toEqual([
      { afirmacion: "[CIFRA: comisión media]", fuente_sugerida: "Superintendencia Financiera" },
      { afirmacion: "37 dólares al mes", fuente_sugerida: "" },
      { afirmacion: "Tasa de 3%", fuente_sugerida: "https://banco.test/tasas | anexo" },
    ]);
    expect(r.notas).toBe("Revisar el dato de 2025.");
  });

  it("acepta «- ninguna» y sin sección de notas", () => {
    const r = leerRespuestaGuion(`${MARCAS.guion}\n${guionLargo}\n${MARCAS.cifras}\n- ninguna\n`);
    expect(r.cifras).toEqual([]);
    expect(r.notas).toBe("");
  });

  it("acepta JSON con el mismo esquema que la API", () => {
    const r = leerRespuestaGuion(JSON.stringify({ guion: guionLargo, cifras: [{ afirmacion: "x", fuente_sugerida: "" }], notas: "" }));
    expect(r.cifras.length).toBe(1);
  });

  it("rechaza respuestas sin formato, vacías o con guion demasiado corto", () => {
    expect(() => leerRespuestaGuion("")).toThrow(/Pega/);
    expect(() => leerRespuestaGuion("Aquí tienes tu guion: hola")).toThrow(/marcas/);
    expect(() => leerRespuestaGuion(`${MARCAS.guion}\nCorto\n${MARCAS.cifras}\n`)).toThrow(/corto/);
    expect(() => leerRespuestaGuion('{"guion": 3}')).toThrow(/JSON/);
  });
});

describe("informe de investigación pegado", () => {
  it("exige enlaces y un mínimo de contenido", () => {
    const ok = `## Tendencias\n${"texto ".repeat(50)}\n- https://fuente.test/a`;
    expect(leerRespuestaInvestigacion(ok)).toContain("https://fuente.test/a");
    expect(() => leerRespuestaInvestigacion("corto")).toThrow(/corto/);
    expect(() => leerRespuestaInvestigacion("texto ".repeat(60))).toThrow(/enlaces/);
  });
});
