// Identidad neutra del panel. Nada de marca de canal aquí: el acento por canal
// sale de la tabla `canales`. Estos valores se pueden cambiar por entorno.

import { colorSeguro } from "./dominio/canal-config";

export const ACENTO_PANEL_POR_DEFECTO = "#d4d4d8";

export function nombrePanel(): string {
  return process.env.PANEL_NOMBRE?.trim() || "Panel de canales";
}

export function acentoPanel(): string {
  return colorSeguro(process.env.PANEL_COLOR_ACENTO, ACENTO_PANEL_POR_DEFECTO);
}
