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

      <div className="overflow-x-auto rounded-lg border border-borde">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-superficie text-suave">
            <tr>
              <th className="px-3 py-2 font-medium">Persona</th>
              <th className="px-3 py-2 font-medium">Rol en el canal</th>
            </tr>
          </thead>
          <tbody>
            {miembros.map((m) => (
              <tr key={m.user.id} className="border-t border-borde align-top">
                <td className="px-3 py-2">
                  <p>{m.user.name ?? m.user.email}</p>
                  <p className="text-xs text-suave">
                    {m.user.email}
                    {!m.user.activo && " · desactivado"}
                  </p>
                </td>
                <td className="px-3 py-2">
                  {gestiona && (m.user.id !== usuario.id || usuario.esSuperadmin) ? (
                    <ControlesMiembro
                      rol={m.rol}
                      cambiar={cambiarRolAccion.bind(null, canal.slug, m.user.id)}
                      quitar={quitarMiembroAccion.bind(null, canal.slug, m.user.id)}
                    />
                  ) : (
                    NOMBRE_ROL[m.rol]
                  )}
                </td>
              </tr>
            ))}
            {miembros.length === 0 && (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-center text-suave">
                  Nadie tiene acceso a este canal todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-suave">
        Los superadmins de red ven todos los canales y no aparecen en esta lista salvo que tengan un rol en el canal.
      </p>
    </section>
  );
}
