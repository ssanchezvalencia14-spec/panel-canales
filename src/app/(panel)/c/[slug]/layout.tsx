import { notFound } from "next/navigation";
import { AvatarCanal } from "@/components/avatar-canal";
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
        <AvatarCanal nombre={canal.nombre} avatarUrl={canal.avatarUrl} color={colorSeguro(canal.colorAcento, acentoPanel())} />
        <h1 className="text-2xl font-semibold sm:text-3xl">{canal.nombre}</h1>
        {rol && <span className="rounded-full border border-acento px-2.5 py-0.5 text-xs text-texto">{NOMBRE_ROL[rol]}</span>}
      </div>
      {children}
    </div>
  );
}
