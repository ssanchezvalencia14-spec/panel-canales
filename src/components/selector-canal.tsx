"use client";

import { useRouter } from "next/navigation";

type Opcion = { slug: string; nombre: string };

export function SelectorCanal({ canales, actual }: { canales: Opcion[]; actual: string | null }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">Canal</span>
      <select
        value={actual ?? ""}
        onChange={(e) => router.push(e.target.value ? `/c/${e.target.value}` : "/")}
        className="max-w-[60vw] rounded-md border border-borde bg-superficie px-2 py-1.5 text-sm outline-none focus:border-acento"
      >
        <option value="">Red · todos los canales</option>
        {canales.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.nombre}
          </option>
        ))}
      </select>
    </label>
  );
}
