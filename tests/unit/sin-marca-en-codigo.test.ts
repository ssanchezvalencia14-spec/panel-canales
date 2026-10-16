// Guardia: ningún canal puede quedar fijo en el código. La marca, el horario y
// los pilares de cada canal viven en datos (datos/canales y la base).

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(import.meta.dirname, "../..");

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return n === "generated" ? [] : archivos(p);
    return /\.(tsx?|css|mjs)$/.test(n) ? [p] : [];
  });
}

describe("código libre de canales concretos", () => {
  const canales = readdirSync(path.join(RAIZ, "datos/canales"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(path.join(RAIZ, "datos/canales", f), "utf8")));

  const prohibidos = canales.flatMap((c) => [c.nombre, c.slug, c.colorAcento, ...c.pilares]) as string[];
  const fuentes = [
    ...archivos(path.join(RAIZ, "src")),
    ...archivos(path.join(RAIZ, "scripts")),
    path.join(RAIZ, "prisma/schema.prisma"),
  ];

  it("ningún nombre, slug, color o pilar de canal aparece en src/, scripts/ ni el esquema", () => {
    const hallazgos: string[] = [];
    for (const f of fuentes) {
      const texto = readFileSync(f, "utf8").toLowerCase();
      for (const p of prohibidos) {
        if (texto.includes(p.toLowerCase())) hallazgos.push(`${path.relative(RAIZ, f)}: «${p}»`);
      }
    }
    expect(hallazgos).toEqual([]);
  });
});
