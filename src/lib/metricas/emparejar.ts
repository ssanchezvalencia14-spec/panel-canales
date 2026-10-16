// Emparejar títulos de la plataforma con los videos del panel.
// Conservador: igualdad normalizada, o uno contiene al otro si es largo
// (los títulos de YouTube suelen llevar «| Nombre del canal» al final).

export function normalizarTitulo(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function mismoTitulo(a: string, b: string): boolean {
  const x = normalizarTitulo(a);
  const y = normalizarTitulo(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [corto, largo] = x.length <= y.length ? [x, y] : [y, x];
  return corto.length >= 12 && largo.startsWith(corto);
}

/** Devuelve el único candidato que coincide; si hay cero o varios, null (no adivina). */
export function emparejar<T extends { titulo: string }>(titulo: string, candidatos: readonly T[]): T | null {
  const exactos = candidatos.filter((c) => normalizarTitulo(c.titulo) === normalizarTitulo(titulo));
  if (exactos.length === 1) return exactos[0];
  if (exactos.length > 1) return null;
  const parecidos = candidatos.filter((c) => mismoTitulo(c.titulo, titulo));
  return parecidos.length === 1 ? parecidos[0] : null;
}
