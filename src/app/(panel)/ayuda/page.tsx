import { readFile } from "node:fs/promises";
import path from "node:path";
import { TextoMarkdown } from "@/components/texto-markdown";
import { requireUsuario } from "@/server/sesion";

// La guía vive en docs/GUIA_EQUIPO.md (una sola fuente para el repo y el panel).
export default async function Ayuda() {
  await requireUsuario();
  const guia = await readFile(path.join(process.cwd(), "docs", "GUIA_EQUIPO.md"), "utf8").catch(() => null);

  return (
    <article className="max-w-3xl rounded-lg border border-borde bg-superficie p-5">
      {guia ? <TextoMarkdown md={guia} /> : <p className="text-sm text-suave">La guía no está disponible en este servidor.</p>}
    </article>
  );
}
