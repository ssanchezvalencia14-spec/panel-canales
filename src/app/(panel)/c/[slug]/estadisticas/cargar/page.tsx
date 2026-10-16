import Link from "next/link";
import { notFound } from "next/navigation";
import { FormularioCsv } from "@/components/estadisticas-formularios";
import { fechaLocal } from "@/lib/dominio/fechas";
import { puede } from "@/lib/dominio/roles";
import { prisma } from "@/server/db";
import { obtenerCanalPorSlug } from "@/server/acceso";
import { importarCsvAccion } from "@/server/acciones/estadisticas";
import { requireUsuario } from "@/server/sesion";

export default async function CargarMetricas({ params }: PageProps<"/c/[slug]/estadisticas/cargar">) {
  const { slug } = await params;
  const usuario = await requireUsuario();
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal) notFound();
  if (!puede(usuario, canal.id, "editar_video")) notFound();

  return (
    <section className="space-y-4">
      <Link href={`/c/${canal.slug}/estadisticas`} className="text-sm text-suave hover:text-texto">
        ← Estadísticas
      </Link>
      <h2 className="text-lg font-semibold">Cargar métricas desde CSV</h2>
      <div className="max-w-3xl space-y-2 text-sm text-suave">
        <p>
          Sirve el export de <strong className="text-texto">YouTube Studio</strong> (Analytics → Modo avanzado → Exportar, CSV) o
          de <strong className="text-texto">TikTok Studio</strong>, o una hoja propia. Se reconocen columnas en español o inglés:
          video o enlace o id, título, fecha, vistas, retención (porcentaje medio visto), CTR de impresiones, likes, comentarios,
          compartidos y suscriptores.
        </p>
        <p>
          Cada fila se asocia a una publicación por su enlace o id; si no hay, por el título del video (solo si coincide con un
          único video). Los valores son <strong className="text-texto">totales acumulados</strong> a la fecha. Las filas que no
          se puedan asociar se listan y no se guardan.
        </p>
        <p>
          Para cargar un solo video a mano, ve a su ficha en <Link href={`/c/${canal.slug}/videos`} className="text-acento underline">Videos</Link>.
        </p>
      </div>
      <FormularioCsv accion={importarCsvAccion.bind(null, canal.slug)} hoy={fechaLocal(new Date(), canal.zonaHoraria)} />
    </section>
  );
}
