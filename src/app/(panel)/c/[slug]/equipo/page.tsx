import { notFound } from "next/navigation";
import { ControlesMiembro, FormularioAgregarMiembro } from "@/components/equipo-formularios";
import { NOMBRE_ROL, puede } from "@/lib/dominio/roles";
import { prisma } from "@/server/db";
import { listarMiembros, obtenerCanalPorSlug } from "@/server/acceso";
import { agregarMiembroAccion, cambiarRolAccion, quitarMiembroAccion } from "@/server/acciones/equipo";
import { requireUsuario } from "@/server/sesion";

export default async function Equipo({ params }: PageProps<"/c/[slug]/equipo">) {
  const { slug } = await params;
  const usuario = await requireUsuario();
  const canal = await obtenerCanalPorSlug(prisma, usuario, slug);
  if (!canal) notFound();

  const miembros = await listarMiembros(prisma, usuario, canal.id);
  const gestiona = puede(usuario, canal.id, "gestionar_miembros");

  return (
    <section className="space-y-6">
      {gestiona && <FormularioAgregarMiembro accion={agregarMiembroAccion.bind(null, canal.slug)} />}

      <div className="overflow-hidden rounded-2xl border border-borde">
        <div aria-hidden className="hidden grid-cols-[1fr_auto] gap-4 bg-superficie px-4 py-2.5 text-xs text-suave md:grid">
          <span>Persona</span>
          <span>Rol en el canal</span>
        </div>
        <ul className="divide-y divide-borde">
          {miembros.map((m) => (
            <li key={m.user.id} className="flex flex-col gap-2 px-4 py-3 md:grid md:grid-cols-[1fr_auto] md:items-center md:gap-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{m.user.name ?? m.user.email}</p>
                <p className="truncate text-xs text-suave">
                  {m.user.email}
                  {!m.user.activo && " · desactivado"}
                </p>
              </div>
              <div className="text-sm">
                {gestiona && (m.user.id !== usuario.id || usuario.esSuperadmin) ? (
                  <ControlesMiembro
                    rol={m.rol}
                    cambiar={cambiarRolAccion.bind(null, canal.slug, m.user.id)}
                    quitar={quitarMiembroAccion.bind(null, canal.slug, m.user.id)}
                  />
                ) : (
                  <span className="rounded-full border border-borde px-2.5 py-0.5 text-xs">{NOMBRE_ROL[m.rol]}</span>
                )}
              </div>
            </li>
          ))}
          {miembros.length === 0 && <li className="px-4 py-6 text-center text-sm text-suave">Nadie tiene acceso a este canal todavía.</li>}
        </ul>
      </div>
      <p className="text-xs text-suave">
        Los superadmins de red ven todos los canales y no aparecen en esta lista salvo que tengan un rol en el canal.
      </p>
    </section>
  );
}
