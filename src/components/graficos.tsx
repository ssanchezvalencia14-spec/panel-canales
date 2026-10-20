"use client";

// Gráficos de una sola serie en el color de acento del canal (sin leyenda: el
// título del gráfico nombra la serie). Marcas finas, extremos redondeados,
// rejilla recesiva y tooltip al pasar el cursor. Cada gráfico va acompañado de
// su tabla de datos en la página, así la información nunca depende del color.

import { useState } from "react";

export type Barra = { etiqueta: string; valor: number; detalle?: string };

const fmt = (n: number, idioma: string) => new Intl.NumberFormat(idioma).format(Math.round(n));

/** Barras horizontales ordenadas; cada barra lleva su valor como etiqueta directa. */
export function BarrasHorizontales({ datos, idioma, unidad = "vistas" }: { datos: Barra[]; idioma: string; unidad?: string }) {
  const [activa, setActiva] = useState<number | null>(null);
  const max = Math.max(1, ...datos.map((d) => d.valor));
  if (datos.length === 0) return <p className="text-sm text-suave">Sin datos todavía.</p>;
  return (
    <ul className="space-y-1.5" onMouseLeave={() => setActiva(null)}>
      {datos.map((d, i) => (
        <li
          key={d.etiqueta}
          className={`grid grid-cols-[minmax(5rem,11rem)_1fr_auto] items-center gap-3 rounded-lg px-2 py-1 text-sm ${activa === i ? "bg-fondo" : ""}`}
          onMouseEnter={() => setActiva(i)}
          title={`${d.etiqueta}: ${fmt(d.valor, idioma)} ${unidad}${d.detalle ? ` · ${d.detalle}` : ""}`}
        >
          <span className="truncate text-suave">{d.etiqueta}</span>
          <span className="h-3 overflow-hidden rounded-full bg-fondo" aria-hidden>
            <span className="block h-full rounded-full bg-acento" style={{ width: `${Math.max(1, (d.valor / max) * 100)}%` }} />
          </span>
          <span className="text-right font-medium tabular-nums">
            {fmt(d.valor, idioma)}
            {activa === i && d.detalle && <span className="ml-2 text-xs text-suave">{d.detalle}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export type Punto = { fecha: string; valor: number };

/** Línea temporal (2 px) con puntos ≥ 8 px y cruz + tooltip al pasar el cursor. */
export function LineaTiempo({ puntos, idioma, etiqueta }: { puntos: Punto[]; idioma: string; etiqueta: string }) {
  const [activo, setActivo] = useState<number | null>(null);
  if (puntos.length === 0) return <p className="text-sm text-suave">Sin datos todavía.</p>;

  const W = 600;
  const H = 180;
  const m = { izq: 48, der: 12, arr: 12, aba: 24 };
  // Escala ajustada a los datos (con margen) para que el crecimiento se vea;
  // el eje muestra el rango real, así que no exagera ni oculta el cambio.
  const valores = puntos.map((p) => p.valor);
  const bruto = { min: Math.min(...valores), max: Math.max(...valores) };
  const holgura = Math.max(1, (bruto.max - bruto.min) * 0.15);
  const min = Math.max(0, bruto.min - holgura);
  const max = Math.max(min + 1, bruto.max + holgura);
  const x = (i: number) => m.izq + (puntos.length === 1 ? (W - m.izq - m.der) / 2 : (i / (puntos.length - 1)) * (W - m.izq - m.der));
  const y = (v: number) => m.arr + (1 - (v - min) / (max - min)) * (H - m.arr - m.aba);
  const lineas = [0, 0.5, 1].map((f) => min + f * (max - min));
  const d = puntos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(" ");
  const sel = activo === null ? null : puntos[activo];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${etiqueta}: ${puntos.length} mediciones, de ${fmt(bruto.min, idioma)} a ${fmt(bruto.max, idioma)}`}
        onMouseLeave={() => setActivo(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          let mejor = 0;
          puntos.forEach((_, i) => {
            if (Math.abs(x(i) - px) < Math.abs(x(mejor) - px)) mejor = i;
          });
          setActivo(mejor);
        }}
      >
        {lineas.map((v) => (
          <g key={v}>
            <line x1={m.izq} x2={W - m.der} y1={y(v)} y2={y(v)} stroke="var(--borde)" strokeWidth="1" />
            <text x={m.izq - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--texto-suave)">
              {fmt(v, idioma)}
            </text>
          </g>
        ))}
        <text x={m.izq} y={H - 6} fontSize="11" fill="var(--texto-suave)">
          {puntos[0].fecha}
        </text>
        {puntos.length > 1 && (
          <text x={W - m.der} y={H - 6} textAnchor="end" fontSize="11" fill="var(--texto-suave)">
            {puntos.at(-1)!.fecha}
          </text>
        )}
        <path d={`${d} L${x(puntos.length - 1).toFixed(1)},${H - m.aba} L${x(0).toFixed(1)},${H - m.aba} Z`} fill="var(--acento)" opacity="0.12" />
        <path d={d} fill="none" stroke="var(--acento)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {activo !== null && (
          <line x1={x(activo)} x2={x(activo)} y1={m.arr} y2={H - m.aba} stroke="var(--texto-suave)" strokeWidth="1" strokeDasharray="3 3" />
        )}
        {puntos.map((p, i) => (
          <circle key={p.fecha} cx={x(i)} cy={y(p.valor)} r={activo === i ? 5 : puntos.length > 20 ? 0 : 4} fill="var(--acento)" stroke="var(--superficie)" strokeWidth="2" />
        ))}
      </svg>
      {sel && (
        <div className="pointer-events-none absolute top-0 right-0 rounded-lg border border-borde-campo bg-fondo px-2.5 py-1.5 text-xs shadow-lg">
          <span className="text-suave">{sel.fecha}</span> · <span className="tabular-nums">{fmt(sel.valor, idioma)}</span> {etiqueta}
        </div>
      )}
    </div>
  );
}
