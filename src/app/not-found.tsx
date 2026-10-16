import Link from "next/link";

export default function NoEncontrada() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">No encontramos esa página</h1>
      <p className="text-sm text-suave">Puede que no exista o que no tengas acceso a ese canal.</p>
      <Link href="/" className="w-fit rounded-md border border-borde px-4 py-2 text-sm">
        Ir al inicio
      </Link>
    </main>
  );
}
