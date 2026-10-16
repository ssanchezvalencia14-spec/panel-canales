import Link from "next/link";
import { notFound } from "next/navigation";
import { TextoMarkdown } from "@/components/texto-markdown";
import { prisma } from "@/server/db";
import { obtenerCanalPorSlug } from "@/server/acceso";
import { obtenerInforme } from "@/server/automatizaciones";
import { requireUsuario } from "@/server/sesion";

export default async function InformeVista({ params }: PageProps<"/c/[slug]/informes/[id]">) {
  const { slug, id } = await params;
  const usuario = await requireUsuario();
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal) notFound();
  const inf = await obtenerInforme(prisma, usuario, canal.id, id);
  if (!inf) notFound();

  return (
    <section className="space-y-4">
      <Link href={`/c/${canal.slug}/informes`} className="text-sm text-suave hover:text-texto">
        ← Informes
      </Link>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-suave">
        <span>Semana {inf.semana}</span>
        <span>Estado: {inf.estado}</span>
        <span>Generado por {inf.generadoPor?.email ?? "el cron"}</span>
        {inf.aprobadoPor && <span>Aprobado por {inf.aprobadoPor.email}</span>}
        {inf.costo !== null && Number(inf.costo) > 0 && <span>Costo US$ {Number(inf.costo).toFixed(4)}</span>}
      </div>
      <article className="rounded-lg border border-borde bg-superficie p-5">
        <TextoMarkdown md={inf.contenido} />
      </article>
    </section>
  );
}
