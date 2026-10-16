# Panel de canales

Plataforma multicanal para una red de canales de YouTube y TikTok: calendario, estado de cada video, estadísticas y archivos, con aprobación humana obligatoria antes de publicar. La interfaz está en español.

El proyecto no lleva el nombre de ningún canal. Cada canal (marca, idioma, zona horaria, horario, pilares y reglas) es un **registro de datos**. Añadir un canal no requiere tocar código.

Plan completo por fases: [`docs/PLAN_PANEL_CANALES.pdf`](docs/PLAN_PANEL_CANALES.pdf).

## Estado: Fase 0 · Fundamentos

| Entregable | Estado |
|---|---|
| Next.js (App Router, TS) + Tailwind, tema neutro con acento por canal, layout con navegación | ✅ |
| Esquema MySQL con Prisma y migración inicial | ✅ |
| Permisos por rol aplicados en el servidor (capa de acceso) | ✅ |
| Auth.js con enlace por correo (SMTP) | ✅ (probado en local; falta SMTP real) |
| Carga inicial (seed) de canales y agenda | ✅ canal #1 · ⏳ falta el archivo de agenda |
| Despliegue en Hostinger Node.js | ⏳ pendiente (ver «Despliegue») |

## Stack

- **Next.js 16** (App Router, TypeScript) + **Tailwind CSS 4**
- **MySQL** de Hostinger con **Prisma 7** (adaptador `@prisma/adapter-mariadb`, sin motor nativo)
- **Auth.js v5**: enlace por correo con Nodemailer y sesiones en base de datos
- **Vitest** para pruebas unitarias y de integración (MySQL real y efímero)

Sin VPS, Supabase ni Vercel. Remotion, voz e imágenes quedan fuera del panel: el panel solo guarda estados y enlaces (Drive).

## Estructura

```
datos/canales/*.json     Configuración de cada canal (datos, no código)
datos/agendas/<slug>.md  Agenda de publicación de cada canal (opcional, para el seed)
prisma/                  Esquema y migraciones
scripts/                 seed, alta de usuarios, importador de agenda, MySQL local
src/auth.ts              Auth.js (solo entran usuarios dados de alta)
src/proxy.ts             Comprobación optimista de sesión
src/lib/dominio/         Reglas puras: roles, estados, fechas, config de canal
src/lib/agenda/          Lector e importador de agendas en Markdown
src/server/acceso.ts     Capa de acceso: toda consulta filtra por canales del usuario
src/app/                 Login, vista «Red» y vista de canal
tests/unit, tests/integracion
```

## Reglas que el código hace cumplir

- **Aislamiento por canal.** Toda tabla de contenido (`videos`, `tareas`, `activos`, `publicaciones`, `metricas`, `ejecuciones`) lleva `canal_id`. Las tablas hijas apuntan a `(canal_id, video_id)` con una clave foránea compuesta, así la base rechaza mezclar canales. Toda consulta pasa por `src/server/acceso.ts`, que filtra por los canales del usuario. Un canal ajeno responde «no disponible», sin revelar si existe.
- **Roles por canal** (`membresias`): `admin`, `productor`, `revisor` y `lector`. Además, `es_superadmin` en `users` da acceso a toda la red. Matriz en `src/lib/dominio/roles.ts`:

  | Acción | admin | productor | revisor | lector |
  |---|:-:|:-:|:-:|:-:|
  | Ver | ✅ | ✅ | ✅ | ✅ |
  | Crear y editar videos | ✅ | ✅ | — | — |
  | Mover estado | ✅ | ✅ | ✅ | — |
  | Aprobar | ✅ | — | ✅ | — |
  | Programar y publicar | ✅ | — | — | — |
  | Gestionar miembros y configurar canal | ✅ | — | — | — |

- **Flujo de estados:** idea → guion → verificación → producción → revisión → aprobado → programado → publicado.
  - Se avanza de un paso en un paso.
  - Retroceder está permitido, salvo desde «publicado».
  - **No se pasa a producción** sin `fuentes_ok`: las cifras sobre personas o empresas reales deben estar verificadas con fuente.
  - **Aprobar** guarda la firma (`aprobado_por_id` y `aprobado_en`). Sin firma no se puede programar ni publicar. Volver a un estado anterior a «aprobado» retira la firma.
- **Sin canales en el código.** `tests/unit/sin-marca-en-codigo.test.ts` falla si el nombre, slug, color o pilares de un canal aparecen en `src/`, `scripts/` o el esquema.
- **Sin claves en el repo.** Solo variables de entorno; `.env*` está ignorado salvo `.env.example`.
- **Sin registro libre.** Solo entran correos dados de alta y activos. Un correo sin cuenta ve la misma pantalla que uno válido, así no se revela quién tiene acceso.

## Puesta en marcha (local)

Requisitos: Node 22 o superior (probado con 24).

```bash
npm install
```

**Opción A: MySQL efímero, sin instalar nada.** La primera vez descarga MySQL 8.4. Al cerrarlo se pierden los datos.

```bash
SUPERADMIN_EMAIL=tu@correo.com npm run db:local
```

En otra terminal:

```bash
DATABASE_URL=mysql://root@127.0.0.1:3307/panel AUTH_SECRET=algo-largo-y-aleatorio npm run dev
```

**Opción B: tu propio MySQL.** Copia `.env.example` a `.env`, rellena las variables y ejecuta:

```bash
npm run db:migrar
npm run db:seed
npm run dev
```

Sin `SMTP_HOST`, el enlace de acceso **se imprime en la consola del servidor** (solo en desarrollo).

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` / `build` / `start` | Desarrollo, build de producción (webpack) y servidor |
| `npm test` | Pruebas unitarias |
| `npm run test:integracion` | Pruebas contra un MySQL real y efímero (la primera vez descarga MySQL) |
| `npm run typecheck` · `npm run lint` | Tipos y lint |
| `npm run db:migrar` | Aplica migraciones (`prisma migrate deploy`) |
| `npm run db:seed` | Canales de `datos/canales`, sus agendas y el superadmin |
| `npm run db:local` | MySQL efímero con migraciones y seed |
| `npm run usuario:crear -- --email x@y.com [--nombre "…"] [--canal slug --rol productor] [--superadmin]` | Alta de usuario y rol |
| `npm run agenda:importar -- --canal slug --archivo AGENDA.md [--anio 2026] [--simular]` | Importa una agenda; `--simular` solo muestra lo que leería |

## Añadir un canal

1. Crea `datos/canales/<slug>.json` con la misma forma que los existentes. La validación está en `src/lib/dominio/canal-config.ts`.
2. Opcional: añade su agenda en `datos/agendas/<slug>.md`.
3. Ejecuta `npm run db:seed`, que es idempotente.
4. Asigna el equipo con `npm run usuario:crear -- --email … --canal <slug> --rol …`.

**Formato de agenda.** Se acepta una tabla Markdown con columnas como `Fecha | Título | Pilar | Gancho`, o secciones `## Video N · Título` con líneas `Fecha:`, `Pilar:` y `Gancho:`. La hora de publicación y la zona horaria salen del canal. Las fechas sin año necesitan `--anio` (o `AGENDA_ANIO`). El importador no inventa datos: lo que no puede leer lo reporta como aviso.

## Variables de entorno

Detalle en [`.env.example`](.env.example).

| Variable | Obligatoria | Uso |
|---|:-:|---|
| `DATABASE_URL` | ✅ | `mysql://usuario:clave@127.0.0.1:3306/bd` (en Hostinger, host `127.0.0.1`) |
| `AUTH_SECRET` | ✅ | Secreto de Auth.js |
| `AUTH_URL` | ✅ en producción | URL pública del panel |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | ✅ en producción | SMTP de Hostinger (`smtp.hostinger.com`, puerto 465) |
| `EMAIL_FROM` | ✅ en producción | Remitente del correo de acceso |
| `SUPERADMIN_EMAIL` | para el seed | Primer superadmin de red |
| `AGENDA_ANIO` | opcional | Año para fechas de agenda sin año |
| `PANEL_NOMBRE`, `PANEL_COLOR_ACENTO` | opcional | Identidad neutra del panel |
| `DB_LOCAL_PUERTO` | opcional | Puerto de `db:local` (3307) |

## Despliegue en Hostinger (Node.js)

El hosting compartido tiene una glibc antigua: los binarios nativos de Next no cargan y se usa el backend WASM. El repo ya trae los dos ajustes necesarios:

- `next.config.mjs` (no `.ts`)
- `next build --webpack`

Prisma 7 usa un adaptador JavaScript (`mariadb`), así que no depende de motores nativos.

1. Crea en hPanel la base MySQL y el buzón SMTP.
2. Carga **todas** las variables de entorno en el sitio Node.js **antes** del build.
3. Sube el código y compila con Node 24, `app_type: next` y `build_script: build`. Para generar el zip: `git archive HEAD --format=zip -o panel-src.zip`.
4. Aplica migraciones y seed una vez: `npm run db:migrar && npm run db:seed` (por SSH o desde una conexión remota a la base).
5. Usa el dominio provisional `*.hostingersite.com`; el definitivo se cambia más adelante en `AUTH_URL`.
