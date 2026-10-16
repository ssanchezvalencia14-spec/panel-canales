import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { obtenerCanalPorSlug } from "@/server/acceso";
import { obtenerInforme } from "@/server/automatizaciones";
import { requireUsuario } from "@/server/sesion";

/** Muestra Markdown simple como texto: títulos, listas y enlaces clicables (sin HTML del modelo). */
function Texto({ md }: { md: string }) {
  const enlaces = (linea: string) =>
    linea.split(/(https?:\/\/[^\s)\]]+)/g).map((parte, i) =>
      /^https?:\/\//.test(parte) ? (
        <a key={i} href={parte} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-acento underline">
          {parte}
        </a>
      ) : (
        parte.replace(/\*\*/g, "")
      ),
    );
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {md.split("\n").map((l, i) => {
        if (l.startsWith("### ")) return <h4 key={i} className="pt-2 font-semibold">{enlaces(l.slice(4))}</h4>;
        if (l.startsWith("## ")) return <h3 key={i} className="pt-3 text-base font-semibold">{enlaces(l.slice(3))}</h3>;
        if (l.startsWith("# ")) return <h2 key={i} className="text-lg font-semibold">{enlaces(l.slice(2))}</h2>;
        if (/^\s*[-*] /.test(l)) return <p key={i} className="pl-4 before:-ml-3 before:mr-1 before:content-['•']">{enlaces(l.replace(/^\s*[-*] /, ""))}</p>;
        if (!l.trim()) return <div key={i} className="h-2" />;
        return <p key={i}>{enlaces(l)}</p>;
      })}
    </div>
  );
}

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
        <Texto md={inf.contenido} />
      </article>
    </section>
  );
}
