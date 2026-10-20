// Configuración de un canal recién vinculado por enlace. La persona solo pega el
// link: todo lo demás (horario, color, pilares) toma valores razonables que se
// pueden cambiar después sin tocar nada más.

import type { ConfigCanal } from "@/lib/dominio/canal-config";
import { aSlug } from "@/lib/dominio/canal-config";
import type { CanalPublico } from "./publico";

/** Colores para distinguir canales en el calendario; los dos primeros son los de la marca de la agencia. */
export const PALETA_CANALES = ["#ccf02a", "#1d44f9", "#ff8a3d", "#2dd4bf", "#f472b6", "#a78bfa", "#facc15", "#38bdf8"] as const;

/** «es-419» → «es», «en-US» → «en-US», «PT» → «pt»; si no se entiende, «es». */
export function idiomaSeguro(idioma: string | null | undefined): string {
  const m = /^([A-Za-z]{2})(?:[-_]([A-Za-z]{2}))?/.exec(idioma?.trim() ?? "");
  if (!m) return "es";
  const lengua = m[1].toLowerCase();
  return m[2] ? `${lengua}-${m[2].toUpperCase()}` : lengua;
}

/** Identificador libre a partir del handle (o del nombre), con sufijo si ya existe. */
export function slugLibre(canal: Pick<CanalPublico, "handle" | "titulo">, usados: ReadonlySet<string>): string {
  const base = aSlug(canal.handle?.replace(/^@/, "") || canal.titulo) || "canal";
  if (!usados.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidato = `${base}-${n}`;
    if (!usados.has(candidato)) return candidato;
  }
}

export function configDeCanalPublico(
  canal: Pick<CanalPublico, "handle" | "titulo" | "idioma">,
  contexto: { slugsUsados: ReadonlySet<string>; cantidadCanales: number },
): ConfigCanal {
  return {
    slug: slugLibre(canal, contexto.slugsUsados),
    nombre: canal.titulo.trim().slice(0, 120) || "Canal sin nombre",
    idioma: idiomaSeguro(canal.idioma),
    zonaHoraria: "America/Bogota",
    horaPublicacion: "12:00",
    diasPublicacion: ["lun", "mie", "vie"],
    colorAcento: PALETA_CANALES[contexto.cantidadCanales % PALETA_CANALES.length],
    pilares: ["General"],
    reglas: {},
    limiteGastoVideo: null,
  };
}
