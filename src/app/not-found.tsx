import Link from "next/link";

export default function NoEncontrada() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-4 p-6">
      <p aria-hidden className="text-5xl font-bold text-primario">404</p>
      <h1 className="text-xl font-semibold">No encontramos esa página</h1>
      <p className="text-sm text-suave">Puede que no exista o que no tengas acceso a ese canal.</p>
      <Link href="/" className="btn-primario w-fit">
        Ir al inicio
      </Link>
    </main>
  );
}
