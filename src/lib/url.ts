// URL pública del panel para redirecciones desde rutas API. Detrás del proxy de
// Hostinger, req.url apunta al servidor interno (0.0.0.0:3000), no al dominio.

export function urlPublica(ruta: string, respaldo: string): URL {
  return new URL(ruta, process.env.AUTH_URL || respaldo);
}
