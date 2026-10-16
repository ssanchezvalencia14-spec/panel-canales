import { signOut } from "@/auth";
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
        canales={canales.map((c) => ({ slug: c.slug, nombre: c.nombre }))}
        usuario={{
          nombre: usuario.nombre ?? usuario.email,
          detalle: usuario.esSuperadmin ? "Superadmin de red" : `${canales.length} canal(es)`,
        }}
        salir={salir}
      />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </>
  );
}
