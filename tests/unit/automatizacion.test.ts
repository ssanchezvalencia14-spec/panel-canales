import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { evaluarAlertas, reglasDeAlertas, type VideoParaAlertas } from "@/lib/automatizacion/alertas";
import { limitesSemana, semanaISO } from "@/lib/automatizacion/semana";
import { textoResumen } from "@/lib/automatizacion/resumen";
import { costoMaximoInvestigacion, investigadorClaude, promptInvestigacion } from "@/lib/ia/investigacion";

const AHORA = new Date("2026-10-28T15:00:00Z"); // mié 28-oct 10:00 en Bogotá
const reglas = { diasProduccion: 3, colchonMinimo: 2, diasAvisoCifras: 7 };
const v = (id: string, estado: VideoParaAlertas["estado"], iso: string | null, extra: Partial<VideoParaAlertas> = {}): VideoParaAlertas => ({
  id,
  titulo: id,
  estado,
  fechaPublicacion: iso ? new Date(iso) : null,
  cifrasPendientes: 0,
  fuentesOk: true,
  ...extra,
});

describe("alertas", () => {
  it("atraso de producción y de publicación", () => {
    const a = evaluarAlertas(
      [
        v("pasado", "revision", "2026-10-26T17:00:00Z"),
        v("prod-hoy", "guion", "2026-10-31T17:00:00Z"), // producción el 28-oct = hoy
        v("lejos", "idea", "2026-11-20T17:00:00Z"),
        v("ok", "produccion", "2026-10-30T17:00:00Z"),
      ],
      AHORA,
      "America/Bogota",
      reglas,
    );
    const tipos = a.filter((x) => x.videoId).map((x) => `${x.tipo}:${x.videoId}`);
    expect(tipos).toEqual(["atrasado_publicacion:pasado", "atrasado_produccion:prod-hoy"]);
  });

  it("falta de colchón: menos de N listos por publicar", () => {
    const base = [v("a", "aprobado", "2026-11-02T17:00:00Z"), v("b", "programado", "2026-11-04T17:00:00Z")];
    expect(evaluarAlertas(base, AHORA, "America/Bogota", reglas).some((x) => x.tipo === "colchon")).toBe(false);
    const una = evaluarAlertas(base.slice(0, 1), AHORA, "America/Bogota", reglas).find((x) => x.tipo === "colchon")!;
    expect(una).toMatchObject({ clave: "colchon", gravedad: "aviso" });
    expect(evaluarAlertas([], AHORA, "America/Bogota", reglas)[0].gravedad).toBe("grave");
  });

  it("cifras sin verificar en videos próximos o ya avanzados", () => {
    const a = evaluarAlertas(
      [
        v("pronto", "verificacion", "2026-11-02T17:00:00Z", { cifrasPendientes: 2, fuentesOk: false }),
        v("lejano", "verificacion", "2026-12-20T17:00:00Z", { cifrasPendientes: 1, fuentesOk: false }),
        v("avanzado", "revision", "2026-12-20T17:00:00Z", { fuentesOk: false }),
      ],
      AHORA,
      "America/Bogota",
      reglas,
    ).filter((x) => x.tipo === "cifras_sin_verificar");
    expect(a.map((x) => x.videoId)).toEqual(["pronto", "avanzado"]);
    expect(a[1].gravedad).toBe("grave");
  });

  it("los umbrales salen de las reglas del canal", () => {
    expect(reglasDeAlertas({})).toEqual({ colchonMinimo: 2, diasAvisoCifras: 7 });
    expect(reglasDeAlertas({ colchonMinimo: 3, diasAvisoCifras: 5 })).toEqual({ colchonMinimo: 3, diasAvisoCifras: 5 });
  });
});

describe("semana ISO", () => {
  it("calcula semana y límites", () => {
    expect(semanaISO("2026-10-28")).toBe("2026-W44");
    expect(semanaISO("2027-01-01")).toBe("2026-W53");
    expect(semanaISO("2026-01-01")).toBe("2026-W01");
    expect(semanaISO("2024-12-30")).toBe("2025-W01");
    expect(limitesSemana("2026-10-28")).toEqual({ lunes: "2026-10-26", domingo: "2026-11-01" });
  });
});

describe("resumen semanal", () => {
  it("arma el texto solo con datos del panel", () => {
    const t = textoResumen({
      canal: "Canal X",
      semana: "2026-W44",
      lunes: "2026-10-26",
      domingo: "2026-11-01",
      publicados: [{ titulo: "Uno", fecha: "2026-10-26", vistas: 1200 }],
      proximos: [{ titulo: "Dos", fecha: "2026-11-02", estado: "aprobado" }],
      porEstado: { idea: 3, aprobado: 1 },
      alertas: [{ mensaje: "Solo hay 1 video listo", gravedad: "grave" }],
      mejores: [],
      gastoSemana: 1.5,
      actividad: 12,
    });
    expect(t).toContain("# Resumen semanal · Canal X");
    expect(t).toContain("2026-10-26 · Uno · 1200 vistas".replace("1200", new Intl.NumberFormat("es").format(1200)));
    expect(t).toContain("2026-11-02 · Dos · Aprobado");
    expect(t).toContain("Idea: 3 · Aprobado: 1");
    expect(t).toContain("⚠ Solo hay 1 video listo");
    expect(t).toContain("US$ 1.50");
  });
});

describe("investigación con búsqueda web (cliente simulado)", () => {
  const pedido = { canal: { nombre: "Canal X", idioma: "es", pilares: ["P1"], voz: [] }, titulosRecientes: ["Uno"], datosVidiq: "outlier,3x", semana: "2026-W44" };

  it("el prompt exige enlaces y usa los datos de vidIQ", () => {
    const { system, usuario } = promptInvestigacion(pedido);
    expect(system).toMatch(/lleva el enlace/);
    expect(system).toMatch(/No inventes vistas/);
    expect(usuario).toContain("outlier,3x");
    expect(costoMaximoInvestigacion(1000)).toBeGreaterThan(0);
  });

  it("reanuda pause_turn, suma tokens y búsquedas, y cobra las búsquedas", async () => {
    const respuestas = [
      { model: "claude-opus-5-5", stop_reason: "pause_turn", content: [{ type: "server_tool_use" }], usage: { input_tokens: 1000, output_tokens: 100, server_tool_use: { web_search_requests: 3 } } },
      { model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "## Tendencias\n- x (https://a.test)" }], usage: { input_tokens: 2000, output_tokens: 900, server_tool_use: { web_search_requests: 2 } } },
    ];
    const enviados: unknown[] = [];
    const cliente = {
      beta: {
        messages: {
          create: async (p: { messages: unknown[]; tools: unknown[] }) => {
            enviados.push(structuredClone(p.messages));
            expect(p.tools).toEqual([{ type: "web_search_20260209", name: "web_search", max_uses: 8 }]);
            return respuestas.shift();
          },
        },
      },
    } as unknown as Anthropic;
    const r = await investigadorClaude(cliente)(pedido);
    expect(r.busquedas).toBe(5);
    expect(r.uso).toEqual({ input_tokens: 3000, output_tokens: 1000 });
    expect(r.costo).toBeCloseTo((3000 * 4 + 1000 * 20) / 1e6 + 0.05, 6);
    expect(r.informe).toContain("https://a.test");
    expect((enviados[1] as unknown[]).length).toBe(2); // el turno pausado se reenvía
  });
});
