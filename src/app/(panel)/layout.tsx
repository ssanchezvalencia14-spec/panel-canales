import { signOut } from "@/auth";
import { BarraLateral } from "@/components/barra-lateral";
import { BarraSuperior } from "@/components/barra-superior";
import { nombrePanel } from "@/lib/panel";
import { prisma } from "@/server/db";
import { listarCanales } from "@/server/acceso";
import { requireUsuario } from "@/server/sesion";

async function salir() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function PanelLayout({ children }: LayoutProps<"/">) {
  const usuario = await requireUsuario();
  const canales = await listarCanales(prisma, usuario);

  return (
    <>
      <BarraSuperior
        panel={nombrePanel()}
        usuario={{
          nombre: usuario.nombre ?? usuario.email,
          detalle: usuario.esSuperadmin ? "Superadmin de red" : `${canales.length} canal(es)`,
        }}
        salir={salir}
      />
      <div className="md:flex">
        <BarraLateral esSuperadmin={usuario.esSuperadmin} canales={canales.map((c) => ({ slug: c.slug }))} />
        <main className="min-w-0 flex-1 px-4 py-8 md:px-10">{children}</main>
      </div>
    </>
  );
}
