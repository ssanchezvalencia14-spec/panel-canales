// Alta y actualización de canales a partir de datos validados.
// Añadir un canal = un archivo JSON en datos/canales/ (o este mismo flujo
// desde el panel en una fase posterior). Nunca se toca código.

import type { Db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { esquemaCanal, type ConfigCanal } from "@/lib/dominio/canal-config";

export function validarConfigCanal(datos: unknown): ConfigCanal {
  const r = esquemaCanal.safeParse(datos);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`).join("; ");
    throw new Error(`Configuración de canal inválida — ${detalle}`);
  }
  return r.data;
}

export async function guardarCanal(db: Db, config: ConfigCanal) {
  const datos = {
    nombre: config.nombre,
    idioma: config.idioma,
    zonaHoraria: config.zonaHoraria,
    horaPublicacion: config.horaPublicacion,
    diasPublicacion: config.diasPublicacion,
    colorAcento: config.colorAcento,
    pilares: config.pilares,
    reglas: config.reglas as Prisma.InputJsonValue,
    limiteGastoVideo: config.limiteGastoVideo,
  };
  return db.canal.upsert({
    where: { slug: config.slug },
    create: { slug: config.slug, ...datos },
    update: datos,
  });
}
