import { textoSobre } from "@/lib/dominio/calendario-global";
import { imagenSegura } from "@/lib/youtube/estadisticas";

const TAMANOS = { sm: "h-7 w-7 text-[11px]", md: "h-10 w-10 text-sm", lg: "h-12 w-12 text-base" } as const;

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return (partes.length > 1 ? partes[0][0] + partes[1][0] : (partes[0] ?? "?").slice(0, 2)).toUpperCase();
}

/** Foto del canal de YouTube o, si no hay, sus iniciales sobre el color del canal. */
export function AvatarCanal({ nombre, avatarUrl, color, tamano = "md" }: { nombre: string; avatarUrl?: string | null; color: string; tamano?: keyof typeof TAMANOS }) {
  const src = imagenSegura(avatarUrl ?? null);
  const clase = `${TAMANOS[tamano]} shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-superficie`;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" loading="lazy" className={`${clase} object-cover`} style={{ ["--tw-ring-color" as string]: color }} />;
  }
  return (
    <span
      aria-hidden
      className={`${clase} inline-flex items-center justify-center font-semibold`}
      style={{ backgroundColor: color, color: textoSobre(color), ["--tw-ring-color" as string]: color }}
    >
      {iniciales(nombre)}
    </span>
  );
}
