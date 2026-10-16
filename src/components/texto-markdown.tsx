// Markdown simple como texto: títulos, listas, tablas, `código`, **negrita** y
// enlaces clicables. No interpreta HTML: es seguro con texto del modelo.

import type { ReactNode } from "react";

function enLinea(texto: string): ReactNode[] {
  return texto.split(/(`[^`]+`|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)\]]+|\*\*[^*]+\*\*)/g).map((p, i) => {
    if (/^`[^`]+`$/.test(p)) return <code key={i} className="rounded bg-borde/60 px-1 font-mono text-[0.85em]">{p.slice(1, -1)}</code>;
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    const md = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(p);
    if (md) {
      const externo = /^https?:\/\//.test(md[2]);
      return externo ? (
        <a key={i} href={md[2]} target="_blank" rel="noopener noreferrer nofollow" className="text-acento underline">{md[1]}</a>
      ) : (
        <span key={i} className="text-acento">{md[1]}</span>
      );
    }
    if (/^https?:\/\//.test(p)) {
      return <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-acento underline">{p}</a>;
    }
    return p;
  });
}

const celdas = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function TextoMarkdown({ md }: { md: string }) {
  const lineas = md.replace(/\r\n/g, "\n").split("\n");
  const bloques: ReactNode[] = [];
  let enCodigo: string[] | null = null;

  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (l.trim().startsWith("```")) {
      if (enCodigo) {
        bloques.push(<pre key={i} className="overflow-x-auto rounded-md border border-borde bg-fondo p-3 font-mono text-xs">{enCodigo.join("\n")}</pre>);
        enCodigo = null;
      } else enCodigo = [];
      continue;
    }
    if (enCodigo) {
      enCodigo.push(l.replace(/^ {3}/, ""));
      continue;
    }
    // Tabla: cabecera, separador |---| y filas.
    if (l.trim().startsWith("|") && /^\s*\|[\s:|-]+\|\s*$/.test(lineas[i + 1] ?? "")) {
      const cab = celdas(l);
      const filas: string[][] = [];
      i += 2;
      while (i < lineas.length && lineas[i].trim().startsWith("|")) filas.push(celdas(lineas[i++]));
      i--;
      bloques.push(
        <div key={i} className="overflow-x-auto">
          <table className="my-2 w-full text-sm">
            <thead className="text-left text-xs text-suave">
              <tr>{cab.map((c, j) => <th key={j} className="border-b border-borde px-2 py-1 font-medium">{enLinea(c)}</th>)}</tr>
            </thead>
            <tbody>
              {filas.map((f, k) => (
                <tr key={k} className="border-b border-borde">
                  {f.map((c, j) => <td key={j} className={`px-2 py-1 align-top ${c === "✓" ? "text-center" : ""}`}>{enLinea(c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (l.startsWith("### ")) bloques.push(<h4 key={i} className="pt-2 font-semibold">{enLinea(l.slice(4))}</h4>);
    else if (l.startsWith("## ")) bloques.push(<h3 key={i} className="pt-4 text-base font-semibold">{enLinea(l.slice(3))}</h3>);
    else if (l.startsWith("# ")) bloques.push(<h2 key={i} className="text-lg font-semibold">{enLinea(l.slice(2))}</h2>);
    else if (/^\s*[-*] /.test(l)) {
      const sangria = /^\s*/.exec(l)![0].length >= 2;
      bloques.push(<p key={i} className={`${sangria ? "pl-8" : "pl-4"} before:-ml-3 before:mr-1 before:content-['•']`}>{enLinea(l.replace(/^\s*[-*] /, ""))}</p>);
    } else if (/^\s*\d+\. /.test(l)) bloques.push(<p key={i} className="pl-4">{enLinea(l.trim())}</p>);
    else if (!l.trim()) bloques.push(<div key={i} className="h-2" />);
    else bloques.push(<p key={i} className={/^\s{2,}/.test(l) ? "pl-4" : ""}>{enLinea(l.trim())}</p>);
  }
  return <div className="space-y-1 text-sm leading-relaxed">{bloques}</div>;
}
