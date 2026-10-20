"use client";

// Último recurso: falla el layout raíz. Sin estilos globales, todo en línea.
export default function ErrorGlobal({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <html lang="es">
      <body style={{ margin: 0, background: "#0a1140", color: "#ffffff", fontFamily: "Poppins, system-ui, sans-serif" }}>
        <main style={{ maxWidth: 420, margin: "15vh auto", padding: 24 }}>
          <h1 style={{ fontSize: 20 }}>El panel no pudo cargar</h1>
          <p style={{ fontSize: 14, color: "#aab5ef" }}>Vuelve a intentarlo en un momento. Si se repite, avisa al admin con la referencia.</p>
          {digest && <p style={{ fontSize: 12, fontFamily: "monospace", color: "#aab5ef" }}>Referencia: {digest}</p>}
          <button type="button" onClick={() => retry()} style={{ padding: "8px 18px", borderRadius: 9999, border: 0, cursor: "pointer", background: "#ccf02a", color: "#0a1140", fontWeight: 600 }}>
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
