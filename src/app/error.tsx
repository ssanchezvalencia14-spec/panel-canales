"use client";

import Link from "next/link";

// Error inesperado en una página: mensaje en español, sin detalles internos.
// «digest» es la referencia que Next deja en los logs del servidor.
export default function ErrorPagina({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Algo falló al cargar esta página</h1>
      <p className="text-sm text-suave">
        Puede ser algo pasajero (la base de datos o un servicio externo). Vuelve a intentarlo; si se repite, pásale la referencia al admin.
      </p>
      {digest && <p className="font-mono text-xs text-suave">Referencia: {digest}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={() => retry()} className="btn-primario">
          Reintentar
        </button>
        <Link href="/" className="btn-secundario">
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
