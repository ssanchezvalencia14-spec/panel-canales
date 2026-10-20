import Link from "next/link";
import { notFound } from "next/navigation";
import { FormularioCanal } from "@/components/formulario-canal";
import { puedeAdministrarRed } from "@/lib/dominio/roles";
import { crearCanalAccion } from "@/server/acciones/canales";
import { requireUsuario } from "@/server/sesion";

export default async function CanalAvanzado() {
  const usuario = await requireUsuario();
  if (!puedeAdministrarRed(usuario)) notFound();

  return (
    <section>
      <Link href="/canales" className="text-sm text-suave hover:text-acento">
        ← Volver a canales
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Crear canal manualmente</h1>
      <p className="mt-1 mb-6 text-sm text-suave">
        Solo si necesitas configurar todo a mano. Lo normal es pegar el enlace del canal en la pantalla anterior.
      </p>
      <FormularioCanal accion={crearCanalAccion} zonas={Intl.supportedValuesOf("timeZone")} />
    </section>
  );
}
