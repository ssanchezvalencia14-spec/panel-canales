// Texto del resumen semanal del canal (Markdown). Determinista: solo cuenta
// lo que está en el panel, sin interpretar ni inventar.

import { NOMBRE_ESTADO, ESTADOS_VIDEO, type EstadoVideo } from "@/lib/dominio/estados";

export type DatosResumen = {
  canal: string;
  semana: string;
  lunes: string;
  domingo: string;
  publicados: { titulo: string; fecha: string; vistas: number | null }[];
  proximos: { titulo: string; fecha: string; estado: EstadoVideo }[];
  porEstado: Partial<Record<EstadoVideo, number>>;
  alertas: { mensaje: string; gravedad: string }[];
  mejores: { titulo: string; vistas: number }[];
  gastoSemana: number;
  actividad: number;
};

const n = (x: number) => new Intl.NumberFormat("es").format(x);

export function textoResumen(d: DatosResumen): string {
  const l: string[] = [];
  l.push(`# Resumen semanal · ${d.canal}`, "", `Semana ${d.semana} (del ${d.lunes} al ${d.domingo}).`, "");

  l.push("## Publicado esta semana");
  if (d.publicados.length === 0) l.push("- Nada publicado esta semana.");
  for (const p of d.publicados) l.push(`- ${p.fecha} · ${p.titulo}${p.vistas !== null ? ` · ${n(p.vistas)} vistas` : ""}`);
  l.push("");

  l.push("## Próximos 7 días");
  if (d.proximos.length === 0) l.push("- No hay publicaciones previstas.");
  for (const p of d.proximos) l.push(`- ${p.fecha} · ${p.titulo} · ${NOMBRE_ESTADO[p.estado]}`);
  l.push("");

  l.push("## Estado de la producción");
  const estados = ESTADOS_VIDEO.filter((e) => (d.porEstado[e] ?? 0) > 0);
  l.push(estados.length ? estados.map((e) => `${NOMBRE_ESTADO[e]}: ${d.porEstado[e]}`).join(" · ") : "Sin videos.");
  l.push("");

  l.push("## Alertas abiertas");
  if (d.alertas.length === 0) l.push("- Ninguna.");
  for (const a of d.alertas) l.push(`- ${a.gravedad === "grave" ? "⚠ " : ""}${a.mensaje}`);
  l.push("");

  if (d.mejores.length) {
    l.push("## Más vistos (acumulado)");
    for (const m of d.mejores) l.push(`- ${m.titulo} · ${n(m.vistas)} vistas`);
    l.push("");
  }

  l.push("## Operación");
  l.push(`- Gasto registrado esta semana: US$ ${d.gastoSemana.toFixed(2)}`);
  l.push(`- Acciones en el registro de actividad: ${d.actividad}`);
  return l.join("\n").trim() + "\n";
}
