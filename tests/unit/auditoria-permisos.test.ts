// Auditoría de permisos (Fase 6). Revisa el código fuente para que ninguna
// puerta de entrada al servidor quede sin control de sesión o de rol:
//  - cada server action pide la sesión (requireUsuario) antes de nada;
//  - cada ruta API exige sesión, el secreto de cron o es la de Auth.js;
//  - cada función de datos que recibe un usuario comprueba su rol;
//  - cada página del panel carga el usuario de la sesión;
//  - la tabla de permisos por rol es exactamente la documentada.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ACCIONES, ROLES, rolPuede } from "@/lib/dominio/roles";
import { requisitoDeRuta } from "@/lib/dominio/rutas";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (p: string) => readFileSync(path.join(RAIZ, p), "utf8").replace(/\r\n/g, "\n");

function archivos(dir: string, filtro: (n: string) => boolean): string[] {
  const out: string[] = [];
  for (const n of readdirSync(path.join(RAIZ, dir))) {
    const rel = path.posix.join(dir, n);
    if (statSync(path.join(RAIZ, rel)).isDirectory()) out.push(...archivos(rel, filtro));
    else if (filtro(n)) out.push(rel);
  }
  return out;
}

/** Cuerpo de cada función exportada (hasta la siguiente declaración de primer nivel). */
function funcionesExportadas(codigo: string): { nombre: string; firma: string; cuerpo: string }[] {
  const partes = codigo.split(/\n(?=export |async function |function |const |type |class )/);
  return partes.flatMap((p) => {
    const m = /^export (?:async )?function (\w+)\s*(?:<[^>]*>)?\(([\s\S]*?)\)\s*(?::[^{]+)?\{/.exec(p);
    return m ? [{ nombre: m[1], firma: m[2], cuerpo: p }] : [];
  });
}

describe("server actions", () => {
  const acciones = archivos("src/server/acciones", (n) => n.endsWith(".ts")).filter((f) => leer(f).startsWith('"use server"'));

  it("hay archivos de acciones que revisar", () => {
    expect(acciones.length).toBeGreaterThanOrEqual(7);
  });

  for (const f of acciones) {
    it(`${f}: toda acción exportada pide la sesión`, () => {
      const codigo = leer(f);
      const fns = funcionesExportadas(codigo);
      expect(fns.length).toBeGreaterThan(0);
      const sinControl = fns.filter((fn) => !/requireUsuario\(|canalDe\(/.test(fn.cuerpo)).map((fn) => fn.nombre);
      expect(sinControl).toEqual([]);
      // canalDe, si existe, resuelve la sesión y el canal visible para el usuario.
      if (codigo.includes("async function canalDe")) {
        const canalDe = codigo.slice(codigo.indexOf("async function canalDe"));
        expect(canalDe.slice(0, 400)).toMatch(/requireUsuario\(\)[\s\S]*obtenerCanalPorSlug\(/);
      }
    });
  }
});

describe("rutas API", () => {
  const rutas = archivos("src/app/api", (n) => n === "route.ts");
  for (const f of rutas) {
    it(`${f}: exige sesión o secreto de cron`, () => {
      const codigo = leer(f);
      if (f.includes("[...nextauth]")) return expect(codigo).toMatch(/handlers/);
      if (f.includes("/cron/")) return expect(codigo).toMatch(/if \(!cronAutorizado\(/);
      expect(codigo).toMatch(/await auth\(\)|requireUsuario\(|verificarEstado\(/);
    });
  }

  it("el proxy solo deja pasar sin sesión el login, Auth.js y el cron", () => {
    const publicas = ["/login", "/login/revisa-tu-correo", "/api/auth/signin", "/api/cron/diario", "/api/cron/respaldo"];
    const privadas = ["/", "/ayuda", "/auditoria", "/canales/nuevo", "/c/canal-x/videos", "/api/respaldo", "/api/integraciones/google/callback", "/loginx", "/api/cronx"];
    for (const p of publicas) expect(requisitoDeRuta(p).tipo, p).toBe("publica");
    for (const p of privadas) expect(requisitoDeRuta(p).tipo, p).not.toBe("publica");
    expect(requisitoDeRuta("/auditoria").tipo).toBe("superadmin");
  });
});

describe("capa de datos", () => {
  const modulos = ["acceso", "actividad", "auditoria", "automatizaciones", "metricas", "produccion", "publicacion", "sincronizacion"].map((m) => `src/server/${m}.ts`);
  // Funciones que reciben el usuario y delegan el control en otra ya auditada.
  const DELEGAN = new Set(["obtenerCanalPorSlug", "cargarUsuario"]);

  for (const f of modulos) {
    it(`${f}: cada función que recibe un usuario comprueba su rol`, () => {
      const fns = funcionesExportadas(leer(f)).filter((fn) => /UsuarioSesion/.test(fn.firma) && !DELEGAN.has(fn.nombre));
      const sinControl = fns
        .filter((fn) => !/exigir\w*\(|puede\(|puedeAdministrarRed\(|canalesVisibles\(|filtro(?:Id)?Canal\(|listarCanales\(|AccesoDenegado|(?:await|return) \w+\(db, u(?:suario)?,/.test(fn.cuerpo))
        .map((fn) => fn.nombre);
      expect(sinControl).toEqual([]);
    });
  }
});

describe("páginas del panel", () => {
  const paginas = archivos("src/app/(panel)", (n) => n === "page.tsx" || n === "layout.tsx" || n === "route.ts");
  for (const f of paginas) {
    it(`${f}: carga el usuario de la sesión`, () => {
      const codigo = leer(f);
      // Una página que solo redirige no lee datos.
      if (!/prisma|@\/server\//.test(codigo)) return expect(codigo).toMatch(/redirect\(/);
      expect(codigo).toMatch(/requireUsuario\(\)|await auth\(\)/);
    });
  }
});

describe("matriz de permisos por rol", () => {
  // Si cambia algún permiso, este test obliga a actualizar también docs/GUIA_EQUIPO.md.
  const ESPERADO: Record<string, string[]> = {
    admin: [...ACCIONES],
    productor: ["ver", "crear_video", "editar_video", "mover_estado"],
    revisor: ["ver", "mover_estado", "aprobar"],
    lector: ["ver"],
  };

  for (const rol of ROLES) {
    it(`${rol}`, () => {
      expect(ACCIONES.filter((a) => rolPuede(rol, a))).toEqual(ESPERADO[rol]);
    });
  }

  it("superadmin puede todo; sin rol, nada", () => {
    expect(ACCIONES.every((a) => rolPuede("superadmin", a))).toBe(true);
    expect(ACCIONES.some((a) => rolPuede(null, a))).toBe(false);
  });
});
