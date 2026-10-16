import { notFound } from "next/navigation";
import { FormularioCanal } from "@/components/formulario-canal";
import { puedeAdministrarRed } from "@/lib/dominio/roles";
import { crearCanalAccion } from "@/server/acciones/canales";
import { requireUsuario } from "@/server/sesion";

export default async function NuevoCanal() {
  const usuario = await requireUsuario();
  if (!puedeAdministrarRed(usuario)) notFound();

  return (
    <section>
      <h1 className="text-2xl font-semibold">Nuevo canal</h1>
      <p className="mt-1 mb-6 text-sm text-suave">
        El canal se crea vacío. Después puedes dar acceso a su equipo desde la sección Equipo.
      </p>
      <FormularioCanal accion={crearCanalAccion} zonas={Intl.supportedValuesOf("timeZone")} />
    </section>
  );
}
