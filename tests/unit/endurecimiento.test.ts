// Fase 6: logs sin secretos, reintentos solo donde es seguro repetir, SMTP y
// estado de la configuración sin exponer valores.

import { describe, expect, it } from "vitest";
import { limpiar } from "@/lib/log";
import { conReintentos, esperaExponencial, fetchConReintentos, leerRetryAfter } from "@/lib/reintentos";
import { smtpPasajero } from "@/lib/correo";
import { Google, tokenDeAcceso } from "@/lib/google/cliente";
import { estadoConfiguracion } from "@/server/auditoria";
import { topeMensual } from "@/server/produccion";

const sinEspera = async () => {};

function fetchFalso(respuestas: (number | Error)[]) {
  const llamadas: { url: string; metodo: string }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    llamadas.push({ url, metodo: init?.method ?? "GET" });
    const r = respuestas[Math.min(llamadas.length - 1, respuestas.length - 1)];
    if (r instanceof Error) throw r;
    return new Response(r === 204 ? null : JSON.stringify({ ok: true, access_token: "t", items: [] }), { status: r, headers: { "retry-after": "0" } });
  }) as unknown as typeof fetch;
  return { f, llamadas };
}

describe("logs", () => {
  it("oculta claves y tokens y resume errores", () => {
    const l = limpiar({ email: "a@b.co", password: "x", refreshToken: "y", CRON_SECRET: "z", apiKey: "k", error: new Error("boom") });
    expect(l).toMatchObject({ email: "a@b.co", password: "[oculto]", refreshToken: "[oculto]", CRON_SECRET: "[oculto]", apiKey: "[oculto]" });
    expect(l.error).toMatchObject({ nombre: "Error", mensaje: "boom" });
    expect(JSON.stringify(l)).not.toMatch(/"x"|"y"|"z"|"k"/);
  });

  it("corta textos largos", () => {
    expect((limpiar({ log: "a".repeat(5000) }).log as string).length).toBeLessThanOrEqual(1001);
  });
});

describe("reintentos", () => {
  it("espera exponencial con tope", () => {
    expect(esperaExponencial(1, 500, 8000, 0.5)).toBe(500);
    expect(esperaExponencial(3, 500, 8000, 0.5)).toBe(2000);
    expect(esperaExponencial(10, 500, 8000, 0.5)).toBe(8000);
  });

  it("lee Retry-After en segundos o fecha", () => {
    expect(leerRetryAfter("3")).toBe(3000);
    expect(leerRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(leerRetryAfter(null)).toBeNull();
  });

  it("repite un GET ante 503 y corte de red, y se rinde al tercer intento", async () => {
    const a = fetchFalso([503, new Error("ECONNRESET"), 200]);
    const r = await fetchConReintentos(a.f, { esperar: sinEspera })("https://x.test/a");
    expect(r.status).toBe(200);
    expect(a.llamadas.length).toBe(3);

    const b = fetchFalso([500, 500, 500, 200]);
    expect((await fetchConReintentos(b.f, { esperar: sinEspera })("https://x.test/b")).status).toBe(500);
    expect(b.llamadas.length).toBe(3);
  });

  it("no repite un 4xx ni un POST (crear dos veces duplicaría)", async () => {
    const a = fetchFalso([404]);
    expect((await fetchConReintentos(a.f, { esperar: sinEspera })("https://x.test/a")).status).toBe(404);
    expect(a.llamadas.length).toBe(1);

    const b = fetchFalso([503, 200]);
    expect((await fetchConReintentos(b.f, { esperar: sinEspera })("https://x.test/b", { method: "POST" })).status).toBe(503);
    expect(b.llamadas.length).toBe(1);
  });

  it("Google: repite lecturas y el refresh del token, no las creaciones", async () => {
    const lectura = fetchFalso([429, 200]);
    await new Google("tok", lectura.f, sinEspera).eventos("primary", new Date(0), new Date(1));
    expect(lectura.llamadas.length).toBe(2);

    const crear = fetchFalso([503, 200]);
    await expect(new Google("tok", crear.f, sinEspera).crearCarpeta("Video")).rejects.toThrow(/503/);
    expect(crear.llamadas.length).toBe(1);

    const token = fetchFalso([502, 200]);
    // El refresh espera de verdad entre intentos: se usa retry-after 0.
    await expect(tokenDeAcceso({ clientId: "c", clientSecret: "s", redirectUri: "https://r.test" }, "rt", token.f)).resolves.toBe("t");
    expect(token.llamadas.map((l) => l.metodo)).toEqual(["POST", "POST"]);
  });

  it("conReintentos respeta «reintentable»", async () => {
    let n = 0;
    await expect(
      conReintentos(async () => { n++; throw new Error("fatal"); }, { intentos: 3, esperar: sinEspera, reintentable: () => false }),
    ).rejects.toThrow("fatal");
    expect(n).toBe(1);
    n = 0;
    await expect(conReintentos(async () => (++n < 2 ? Promise.reject(new Error("pasajero")) : "ok"), { esperar: sinEspera })).resolves.toBe("ok");
    expect(n).toBe(2);
  });
});

describe("SMTP", () => {
  it("reintenta caídas y rechazos temporales, nunca credenciales malas", () => {
    expect(smtpPasajero({ code: "ECONNECTION" })).toBe(true);
    expect(smtpPasajero({ code: "ETIMEDOUT" })).toBe(true);
    expect(smtpPasajero({ code: "EAUTH", responseCode: 535 })).toBe(false);
    expect(smtpPasajero({ responseCode: 421 })).toBe(true);
    expect(smtpPasajero({ responseCode: 550 })).toBe(false);
    expect(smtpPasajero(new Error("x"))).toBe(false);
  });
});

describe("configuración y topes", () => {
  it("la auditoría dice qué variables faltan sin mostrar valores", () => {
    const e = estadoConfiguracion({ DATABASE_URL: "mysql://u:s3cr3t0-xyz@h/db", SMTP_HOST: "  " });
    expect(e.find((x) => x.nombre === "DATABASE_URL")).toEqual({ nombre: "DATABASE_URL", uso: "Base de datos", definida: true });
    expect(e.find((x) => x.nombre === "SMTP_HOST")?.definida).toBe(false);
    expect(JSON.stringify(e)).not.toContain("s3cr3t0-xyz");
  });

  it("tope mensual: número no negativo o sin tope", () => {
    expect(topeMensual({ limiteGastoMensual: 25 })).toBe(25);
    expect(topeMensual({ limiteGastoMensual: 0 })).toBe(0);
    expect(topeMensual({ limiteGastoMensual: -1 })).toBeNull();
    expect(topeMensual({ limiteGastoMensual: "25" })).toBeNull();
    expect(topeMensual(null)).toBeNull();
  });
});
