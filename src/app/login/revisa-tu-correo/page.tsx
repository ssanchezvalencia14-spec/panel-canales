import Link from "next/link";

export default function RevisaTuCorreo() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-borde bg-superficie p-8">
        <h1 className="text-xl font-semibold">Revisa tu correo</h1>
        <p className="mt-2 text-sm text-suave">
          Si tu correo tiene acceso, te llegó un enlace para entrar. Vence en 15 minutos y sirve una sola vez.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm text-acento underline">
          Volver
        </Link>
      </div>
    </main>
  );
}
