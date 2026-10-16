// Limpieza diaria: sesiones y enlaces de acceso caducados no sirven para nada
// y solo engordan la base y los respaldos.

import type { Db } from "@/lib/db";

export async function limpiarCaducados(db: Db, ahora = new Date()) {
  const [sesiones, enlaces] = await Promise.all([
    db.session.deleteMany({ where: { expires: { lt: ahora } } }),
    db.verificationToken.deleteMany({ where: { expires: { lt: ahora } } }),
  ]);
  return { sesiones: sesiones.count, enlaces: enlaces.count };
}
