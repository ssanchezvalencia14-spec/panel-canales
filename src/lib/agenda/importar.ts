// Importa una agenda (Markdown) a la tabla `videos` de un canal.
// Idempotente: un video con el mismo título en el mismo canal se actualiza
// (solo si sigue en «idea») en vez de duplicarse.

import type { Db } from "@/lib/db";
import { leerPilares } from "@/lib/dominio/canal-config";
import { fechaLocalAUtc } from "@/lib/dominio/fechas";
import { ESTADOS_CON_APROBACION, type EstadoVideo } from "@/lib/dominio/estados";
import { parsearAgenda, type OpcionesAgenda } from "./parsear";

export type ResumenImportacion = {
  creados: number;
  actualizados: number;
  sinCambios: number;
  avisos: string[];
};

export async function importarAgenda(
  db: Db,
  canalSlug: string,
  markdown: string,
  opciones: OpcionesAgenda = {},
): Promise<ResumenImportacion> {
  const canal = await db.canal.findUnique({ where: { slug: canalSlug } });
  if (!canal) throw new Error(`No existe el canal «${canalSlug}».`);

  const { entradas, avisos } = parsearAgenda(markdown, opciones);
  const pilares = leerPilares(canal.pilares);
  const resumen: ResumenImportacion = { creados: 0, actualizados: 0, sinCambios: 0, avisos: [...avisos] };

  for (const e of entradas) {
    if (e.pilar && pilares.length && !pilares.includes(e.pilar)) {
      resumen.avisos.push(`«${e.titulo}»: el pilar «${e.pilar}» no está en la configuración del canal.`);
    }
    // Una agenda nunca puede dejar un video aprobado, programado o publicado:
    // esos estados exigen la firma de una persona con rol.
    let estado: EstadoVideo = e.estado ?? "idea";
    if (ESTADOS_CON_APROBACION.includes(estado)) {
      resumen.avisos.push(`«${e.titulo}»: el estado «${estado}» exige aprobación humana; se importa en «revision».`);
      estado = "revision";
    }
    const fechaPublicacion = e.fecha
      ? fechaLocalAUtc(e.fecha, canal.horaPublicacion, canal.zonaHoraria)
      : null;

    const existente = await db.video.findFirst({
      where: { canalId: canal.id, titulo: e.titulo },
      select: { id: true, estado: true },
    });

    if (!existente) {
      await db.video.create({
        data: {
          canalId: canal.id,
          titulo: e.titulo,
          pilar: e.pilar,
          gancho: e.gancho,
          notas: e.notas,
          estado,
          fechaPublicacion,
        },
      });
      resumen.creados++;
    } else if (existente.estado === "idea") {
      await db.video.update({
        where: { id: existente.id },
        data: { pilar: e.pilar, gancho: e.gancho, notas: e.notas, estado, fechaPublicacion },
      });
      resumen.actualizados++;
    } else {
      resumen.sinCambios++;
    }
  }
  return resumen;
}
