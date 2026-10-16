// Alta y actualización de canales a partir de datos validados.
// Añadir un canal = un archivo JSON en datos/canales/ o la pantalla
// «Nuevo canal» del panel. Nunca se toca código.

import { z } from "zod";
import type { Db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { esquemaCanal, type ConfigCanal } from "@/lib/dominio/canal-config";
import { ROLES } from "@/lib/dominio/roles";

function detalleError(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`).join("; ");
}

export function validarConfigCanal(datos: unknown): ConfigCanal {
  const r = esquemaCanal.safeParse(datos);
  if (!r.success) throw new Error(`Configuración de canal inválida — ${detalleError(r.error)}`);
  return r.data;
}

/** Archivo de datos/canales/*.json: la configuración más datos solo para el seed. */
export const esquemaSemillaCanal = esquemaCanal.extend({
  /** Ruta de la agenda Markdown, relativa a la raíz del proyecto. */
  agenda: z.string().optional(),
  /** Miembros iniciales del canal. */
  equipo: z
    .array(z.object({ email: z.string().trim().toLowerCase().email(), nombre: z.string().optional(), rol: z.enum(ROLES) }))
    .default([]),
});

export type SemillaCanal = z.infer<typeof esquemaSemillaCanal>;

export function validarSemillaCanal(datos: unknown): SemillaCanal {
  const r = esquemaSemillaCanal.safeParse(datos);
  if (!r.success) throw new Error(`Configuración de canal inválida — ${detalleError(r.error)}`);
  return r.data;
}

/** Archivo datos/red.json: configuración de la red. */
export const esquemaRed = z.object({
  superadmins: z.array(z.string().trim().toLowerCase().email()).default([]),
});

function datosCanal(config: ConfigCanal) {
  return {
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
}

/** Crea o actualiza un canal por slug (lo usa el seed, que es idempotente). */
export async function guardarCanal(db: Db, config: ConfigCanal) {
  const datos = datosCanal(config);
  return db.canal.upsert({
    where: { slug: config.slug },
    create: { slug: config.slug, ...datos },
    update: datos,
  });
}

export class SlugOcupado extends Error {
  constructor(slug: string) {
    super(`Ya existe un canal con el identificador «${slug}».`);
    this.name = "SlugOcupado";
  }
}

/** Crea un canal nuevo; nunca sobrescribe uno existente. */
export async function insertarCanal(db: Db, config: ConfigCanal) {
  try {
    return await db.canal.create({ data: { slug: config.slug, ...datosCanal(config) } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new SlugOcupado(config.slug);
    }
    throw e;
  }
}
