import Link from "next/link";

export default function CanalNoEncontrado() {
  return (
    <section className="rounded-lg border border-borde bg-superficie p-6">
      <h1 className="text-lg font-semibold">Canal no disponible</h1>
      <p className="mt-2 text-sm text-suave">No existe o no tienes acceso a él.</p>
      <Link href="/" className="mt-4 inline-block text-sm underline">
        Volver a la red
      </Link>
    </section>
  );
}
