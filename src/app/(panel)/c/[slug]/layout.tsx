import { notFound } from "next/navigation";
import { colorSeguro } from "@/lib/dominio/canal-config";
import { NOMBRE_ROL, rolEnCanal } from "@/lib/dominio/roles";
import { acentoPanel } from "@/lib/panel";
import { prisma } from "@/server/db";
import { obtenerCanalPorSlug } from "@/server/acceso";
import { requireUsuario } from "@/server/sesion";

// Todo lo que está dentro de un canal toma su color de acento de la configuración.
export default async function CanalLayout({ children, params }: LayoutProps<"/c/[slug]">) {
  const { slug } = await params;
  const usuario = await requireUsuario();
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal) notFound();
  const rol = rolEnCanal(usuario, canal.id);

  return (
    <div style={{ "--acento": colorSeguro(canal.colorAcento, acentoPanel()) } as React.CSSProperties}>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span aria-hidden className="h-4 w-4 rounded-full bg-acento" />
        <h1 className="text-2xl font-semibold">{canal.nombre}</h1>
        {rol && <span className="rounded-full border border-acento px-2 py-0.5 text-xs text-acento">{NOMBRE_ROL[rol]}</span>}
      </div>
      {children}
    </div>
  );
}
