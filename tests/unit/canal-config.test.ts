import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { colorSeguro } from "@/lib/dominio/canal-config";
import { validarConfigCanal } from "@/lib/canales";

const base = {
  slug: "canal-prueba",
  nombre: "Canal de prueba",
  zonaHoraria: "America/Mexico_City",
  horaPublicacion: "18:30",
  diasPublicacion: ["mar", "jue"],
  colorAcento: "#3366FF",
  pilares: ["Uno"],
};

describe("configuración de canal", () => {
  it("acepta una configuración válida y completa valores por defecto", () => {
    const c = validarConfigCanal(base);
    expect(c.idioma).toBe("es");
    expect(c.reglas).toEqual({});
  });

  it("rechaza datos inválidos con un mensaje claro", () => {
    expect(() => validarConfigCanal({ ...base, zonaHoraria: "Marte/Olimpo" })).toThrow(/zonaHoraria/);
    expect(() => validarConfigCanal({ ...base, colorAcento: "red;}" })).toThrow(/colorAcento/);
    expect(() => validarConfigCanal({ ...base, horaPublicacion: "6pm" })).toThrow(/horaPublicacion/);
    expect(() => validarConfigCanal({ ...base, slug: "Con Espacios" })).toThrow(/slug/);
  });

  it("el color de acento nunca inyecta CSS", () => {
    expect(colorSeguro("#E9B949", "#000000")).toBe("#E9B949");
    expect(colorSeguro("red; background:url(x)", "#000000")).toBe("#000000");
  });

  it("todos los archivos de datos/canales son válidos", () => {
    const dir = path.resolve(import.meta.dirname, "../../datos/canales");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      expect(() => validarConfigCanal(JSON.parse(readFileSync(path.join(dir, f), "utf8"))), f).not.toThrow();
    }
  });
});
