import { NOMBRE_ESTADO, type EstadoVideo } from "@/lib/dominio/estados";

const TONOS: Record<EstadoVideo, string> = {
  idea: "border-zinc-700 text-zinc-300",
  guion: "border-sky-900 text-sky-300",
  verificacion: "border-amber-900 text-amber-300",
  produccion: "border-violet-900 text-violet-300",
  revision: "border-orange-900 text-orange-300",
  aprobado: "border-emerald-900 text-emerald-300",
  programado: "border-teal-900 text-teal-300",
  publicado: "border-acento text-acento",
};

export function EstadoVideoChip({ estado }: { estado: EstadoVideo }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs whitespace-nowrap ${TONOS[estado]}`}>
      {NOMBRE_ESTADO[estado]}
    </span>
  );
}
