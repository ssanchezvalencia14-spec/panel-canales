# Panel de canales

Plataforma multicanal para una red de canales de YouTube y TikTok: calendario, estado de cada video, estadísticas y archivos, con aprobación humana obligatoria antes de publicar. La interfaz está en español.

El proyecto no lleva el nombre de ningún canal. Cada canal (marca, idioma, zona horaria, horario, pilares y reglas) es un **registro de datos**. Añadir un canal no requiere tocar código.

Plan completo por fases: [`docs/PLAN_PANEL_CANALES.pdf`](docs/PLAN_PANEL_CANALES.pdf).

## Estado

**Fases 0, 1, 2 y 3** hechas. Desplegado en el dominio provisional de Hostinger.

| Entregable | Estado |
|---|---|
| Next.js + Tailwind, tema neutro con acento por canal | ✅ |
| Navegación lateral: Calendario, Tablero, Videos, Estadísticas, Equipo | ✅ |
| Selector de canal y vista «Red» con resumen de todos los canales | ✅ |
| Prisma + MySQL con el modelo del plan y migraciones | ✅ |
| Auth.js con enlace por correo (solo correos existentes en `users`) | ✅ (en producción depende de credenciales SMTP válidas) |
| Proxy (middleware) que aplica roles en el servidor | ✅ |
| Pantalla «Nuevo canal» (sin tocar código) | ✅ |
| Gestión del equipo del canal (dar acceso, cambiar rol, quitar) | ✅ |
| Seed: canal #1, superadmin, productores, 16 videos de la agenda | ✅ |
| Build para Hostinger Node.js | ✅ |

| **Fase 2 · Datos y estadísticas** | |
| Ficha de cada video con sus publicaciones (YouTube, Shorts, TikTok) | ✅ |
| Métricas por formulario y por CSV (YouTube Studio, TikTok Studio u hoja propia) | ✅ |
| YouTube Analytics por video: vistas, retención, likes, comentarios, compartidos, suscriptores | ✅ (requiere credenciales de Google) |
| Google Calendar: escribe publicación y producción, lee reuniones | ✅ (requiere credenciales de Google) |
| Gráficos y tablero de resultados: mejor pilar, hora y día; comparación de ganchos | ✅ |
| Exportación a CSV | ✅ |

| **Fase 3 · Producción asistida** (el panel no renderiza video) | |
| Puntaje de gancho (0-100, objetivo 72) y revisión de título (≤ 60, `sin-cifra`, `móvil`) guardados en el video | ✅ |
| Bloqueo: sin gancho aprobado no se pasa de «guion»; un admin puede forzarlo | ✅ |
| Borrador de guion con la API de Claude según las reglas de voz del canal | ✅ (requiere `ANTHROPIC_API_KEY`) |
| Checklist de verificación de cifras con fuente obligatoria (alimenta `fuentes_ok`) | ✅ |
| Panel de ejecuciones (voz, imágenes, subtítulos, render en la PC) con estado, costo y enlace | ✅ |
| Tope de gasto por video (del canal, o propio del video) | ✅ |
| «Marcar salida lista» con los enlaces de Drive de largo, TikToks y Shorts | ✅ |

Pendiente para fases siguientes: arrastrar y soltar en el tablero y registro de actividad.

## Datos y estadísticas (Fase 2)

- **Publicaciones.** En la ficha de cada video se registra el enlace publicado. El panel reconoce YouTube (watch, youtu.be, shorts) y TikTok, y guarda el id de la plataforma. Un mismo enlace no puede estar en dos videos.
- **Métricas.** Cada medición es una **foto acumulada** a una fecha: los totales desde que se publicó, como los muestra la plataforma. El total de un video es la última foto de cada publicación. Las vistas, likes y demás se suman; la retención y el CTR se ponderan por vistas. Las mediciones entran de tres formas:
  - **Formulario** en la ficha del video.
  - **CSV** en Estadísticas → Cargar métricas. Sirven el export de YouTube Studio, el de TikTok Studio o una hoja propia, con encabezados en español o inglés. Cada fila se asocia por enlace o id; si no hay, por título, solo si coincide con un único video del canal. Lo que no se puede asociar se lista y no se guarda.
  - **YouTube Analytics**, con Google conectado.
- **Lo que no da la API de YouTube.** Impresiones y CTR de miniaturas no están en la API de YouTube Analytics. El CTR se carga con el CSV de YouTube Studio.
- **Resultados.** Vistas promedio por pilar, por hora y por día de publicación, en la zona horaria del canal, y una tabla de ganchos con su puntaje frente a vistas y retención. Son promedios descriptivos, no predicciones. Con menos de 5 videos medidos, el panel lo advierte.
- **Exportar CSV.** Una fila por publicación con su última medición, en UTF-8 con BOM (abre bien en Excel). Las celdas que empiezan por `=`, `+`, `-` o `@` se neutralizan para evitar fórmulas.

## Producción asistida (Fase 3)

En la ficha de cada video:

- **Título, gancho y miniatura.** Al guardar se calculan el puntaje del gancho y la revisión del título, y quedan guardados en el video (`score_gancho`, `puntaje_gancho`, `revision_titulo`).
  - El **gancho** suma cinco propiedades de 0 a 20: especificidad, dirigido a ti, riesgo, curiosidad y brevedad.
  - El **título** se rechaza si pasa de 60 caracteres y recibe avisos `móvil` (más de 40, se corta en el celular), `sin-cifra`, `vago`, y de miniatura larga o repetida.
  - Objetivo y límites salen de las reglas del canal (`objetivoGancho`, `tituloMax`, `tituloMovil`, `miniaturaPalabras`); por defecto, 72 / 60 / 40 / 3.
  - Son **reimplementaciones propias** de la idea de `hookscore_es.py` y `title_es.py` descrita en la skill del canal, no un port línea a línea: los puntajes pueden diferir de los scripts originales. Sirven para descartar ganchos flojos, no predicen resultados.
- **Bloqueo por gancho.** Para avanzar de «guion» a «verificación» o más allá, el gancho debe alcanzar el objetivo. Un admin puede **forzarlo**: queda registrado quién y cuándo, y el forzado se pierde si cambia el texto del gancho.
- **Borrador de guion con IA.** Usa `claude-opus-5-5` (se cambia con `ANTHROPIC_MODEL`) con esfuerzo alto, salida estructurada y respaldo automático si el modelo declina (`fallbacks: "default"`).
  - El prompt toma la voz, la estructura y la extensión de las reglas del canal (`voz`, `estructuraGuion`, `extensionGuion`), que son datos, no código. Las del canal #1 están reconstruidas a partir de la skill del canal; conviene revisarlas con el `voice.md` real.
  - El modelo no puede inventar cifras: donde falta un dato escribe `[CIFRA: …]`, y cada cifra entra al checklist con su fuente sugerida.
  - Antes de llamar se comprueba que el **peor caso** (32 000 tokens de salida) cabe en el tope de gasto. El costo real (tokens × precio) y el log quedan en `ejecuciones`, y el guion se guarda versionado en `guiones`.
- **Verificación de cifras.** Cada cifra se marca verificada **solo con un enlace de fuente**; lo pueden hacer productor, revisor o admin. Con todas verificadas, `fuentes_ok` pasa a verdadero y el video puede ir a Producción. Si un video no tiene cifras, un revisor o admin lo declara explícitamente y queda en el registro.
- **Ejecuciones.** Cada tarea externa (voz con ElevenLabs, imágenes, subtítulos, render de Remotion en la PC) se registra con estado, costo, enlace de salida y log. Hay una vista por video y un panel por canal, en **Ejecuciones**. Lo que supere el tope de gasto del video no se registra: un admin puede subir el tope del canal o el de ese video.
- **Marcar salida lista.** Con el video en Producción, se pegan los enlaces de Google Drive de cada pieza. Cuántas piezas lleva cada video sale de `reglas.piezasPorVideo` (en el canal #1: 1 largo, 4 TikToks y 3 Shorts). Se guardan como activos versionados, se registra una ejecución con log y costo, y si se marca la casilla el video pasa a Revisión.

### Conectar Google (YouTube + Calendar)

1. En [Google Cloud Console](https://console.cloud.google.com/), crea un proyecto y activa **YouTube Data API v3**, **YouTube Analytics API** y **Google Calendar API**.
2. Configura la pantalla de consentimiento (tipo *Externo*) y añade como usuarios de prueba las cuentas que conectarán canales. Mientras la app esté en modo *Testing*, Google vence el permiso a los 7 días y hay que reconectar; para evitarlo, publica la app.
3. Crea credenciales **ID de cliente OAuth → Aplicación web**, con la URI de redirección `https://<dominio>/api/integraciones/google/callback`.
4. En las variables del sitio, añade `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `INTEGRACIONES_CLAVE` y `CRON_SECRET` desde hPanel. No uses el reemplazo por API, que borra las demás.
5. Un admin del canal entra en **Estadísticas → Conectar Google** con la cuenta dueña del canal de YouTube. El permiso se guarda **cifrado** (AES-256-GCM) y se revoca al desconectar.
6. Sincroniza con **Sincronizar ahora**, o programa el cron del hosting:

   ```bash
   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/cron/sincronizar
   ```

Cada sincronización:
- empareja los videos subidos con los del panel por título, solo si la coincidencia es única;
- guarda la foto de métricas del día;
- crea o actualiza en Google Calendar los eventos de publicación y de producción, marcados como del panel;
- lee las reuniones del calendario (30 días atrás y 120 adelante).

Cada corrida queda en la tabla `ejecuciones` con su log, y el último error se muestra en la página de integraciones.

## Stack

- **Next.js 16** (App Router, TypeScript) + **Tailwind CSS 4**
- **MySQL** de Hostinger con **Prisma 7** (adaptador `@prisma/adapter-mariadb`, sin motor nativo)
- **Auth.js v5**: enlace por correo con Nodemailer y sesiones en base de datos
- **Vitest** para pruebas unitarias y de integración (MySQL real y efímero)

Sin VPS, Supabase ni Vercel. Remotion, voz e imágenes quedan fuera del panel: el panel solo guarda estados y enlaces (Drive).

## Estructura

```
datos/red.json           Superadmins de la red
datos/canales/*.json     Configuración de cada canal, su equipo inicial y la ruta de su agenda
docs/AGENDA_*.md         Agendas de publicación (las importa el seed)
prisma/                  Esquema y migraciones
scripts/                 seed, alta de usuarios, importador de agenda, MySQL local
src/auth.ts              Auth.js (solo entran usuarios dados de alta)
src/proxy.ts             Proxy (middleware): sesión real + roles por ruta, en el servidor
src/lib/dominio/         Reglas puras: roles, estados, rutas, calendario, fechas, config de canal
src/lib/agenda/          Lector e importador de agendas en Markdown
src/server/acceso.ts     Capa de acceso: toda consulta filtra por canales del usuario
src/server/acciones/     Server actions (crear canal, equipo); vuelven a validar permisos
src/app/                 Login, «Red», «Nuevo canal» y las secciones de cada canal
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

- **Roles aplicados en dos capas del servidor.** El proxy (`src/proxy.ts`) lee la sesión real en la base y corta por ruta: sin sesión, al login; `/canales/*`, solo superadmin; `/c/<slug>/*`, solo miembros de ese canal. Después, cada consulta y cada acción vuelve a comprobar el permiso concreto en `src/server/acceso.ts`. Así, por ejemplo, un productor ve el equipo pero no puede cambiarlo.
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
| `npm run db:seed` | Superadmins (`datos/red.json`), canales de `datos/canales`, su equipo y su agenda |
| `npm run build:hostinger` | Migraciones + seed + build (lo usa Hostinger en cada despliegue) |
| `npm run db:local` | MySQL efímero con migraciones y seed |
| `npm run usuario:crear -- --email x@y.com [--nombre "…"] [--canal slug --rol productor] [--superadmin]` | Alta de usuario y rol |
| `npm run agenda:importar -- --canal slug --archivo AGENDA.md [--anio 2026] [--simular]` | Importa una agenda; `--simular` solo muestra lo que leería |

## Añadir un canal

**Desde el panel (recomendado).** Un superadmin entra en **+ Nuevo canal**, completa nombre, zona horaria, hora y días de publicación, color de acento y pilares, y el canal se crea vacío. Después da acceso a su equipo desde **Equipo**.

**Por datos (para cargarlo con agenda).**
1. Crea `datos/canales/<slug>.json` con la misma forma que los existentes. Admite `agenda` (ruta a un `.md`) y `equipo` (`[{ "email", "rol" }]`).
2. Ejecuta `npm run db:seed`, que es idempotente: crea o actualiza, nunca duplica.

**Formato de agenda.** Se acepta una tabla Markdown con columnas como `Fecha | Pilar | Video | Estado | Notas`, o secciones `## Video N · Título` con líneas `Fecha:`, `Pilar:` y `Gancho:`. Fechas como `2026-10-21`, `21/10/2026` o `Mié 21-oct`. Para las fechas sin año, el año sale de una línea `Año: 2026` en el documento, de `--anio` o de `AGENDA_ANIO`.

- La hora de publicación y la zona horaria salen del canal.
- El estado inicial puede ser cualquiera hasta «revision». Los estados que exigen aprobación humana (aprobado, programado, publicado) nunca se importan.
- El importador no inventa datos: lo que no puede leer lo reporta como aviso.

**Carga inicial actual.** El seed crea el canal #1 con los 16 videos de `docs/AGENDA_PUBLICACION_10_VIDEOS.md`. *Gota a gota*, marcado «listo» en la agenda, entra en «revision»; los demás, en «idea». También crea los superadmins de `datos/red.json` y los productores del canal.

## Variables de entorno

Detalle en [`.env.example`](.env.example).

| Variable | Obligatoria | Uso |
|---|:-:|---|
| `DATABASE_URL` | ✅ | `mysql://usuario:clave@127.0.0.1:3306/bd` (en Hostinger, host `127.0.0.1`) |
| `AUTH_SECRET` | ✅ | Secreto de Auth.js |
| `AUTH_URL` | ✅ en producción | URL pública del panel |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | ✅ en producción | SMTP de Hostinger (`smtp.hostinger.com`, puerto 465) |
| `EMAIL_FROM` | ✅ en producción | Remitente del correo de acceso |
| `SUPERADMIN_EMAIL` | opcional | Superadmin extra para el seed (además de `datos/red.json`) |
| `AGENDA_ANIO` | opcional | Año para fechas de agenda sin año |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | para Google | Credenciales OAuth (YouTube Analytics + Calendar) |
| `INTEGRACIONES_CLAVE` | para Google | 32 bytes en base64; cifra los permisos de Google guardados |
| `ANTHROPIC_API_KEY` | para la IA | Clave de la API de Claude (borradores de guion) |
| `ANTHROPIC_MODEL` | opcional | Modelo del borrador (por defecto `claude-opus-5-5`) |
| `CRON_SECRET` | para el cron | Secreto de `/api/cron/sincronizar` (mín. 16 caracteres) |
| `PANEL_NOMBRE`, `PANEL_COLOR_ACENTO` | opcional | Identidad neutra del panel |
| `DB_LOCAL_PUERTO` | opcional | Puerto de `db:local` (3307) |

## Despliegue en Hostinger (Node.js)

El hosting compartido tiene una glibc antigua: los binarios nativos de Next no cargan y se usa el backend WASM. El repo ya trae los dos ajustes necesarios:

- `next.config.mjs` (no `.ts`)
- `next build --webpack`

Prisma 7 usa un adaptador JavaScript (`mariadb`), así que no depende de motores nativos.

1. Crea en hPanel la base MySQL y el buzón SMTP.
2. Carga **todas** las variables de entorno en el sitio Node.js **antes** del build. Al pulsar «Aplicar cambios», hPanel lanza un build solo; no lances otro a la vez, porque uno de los dos falla.
3. Sube el código y compila con Node 24, `app_type: next` y `build_script: build:hostinger`. Ese script aplica migraciones y el seed (idempotente) antes de `next build`. Para generar el zip: `git archive HEAD --format=zip -o panel-src.zip`.
4. **Arranque:** `npm start` ejecuta `next start`, que escucha en el puerto de la variable `PORT` que asigna Hostinger (3000 si no existe). Hostinger publica la salida del build y reinicia el proceso Node.
5. Usa el dominio provisional `*.hostingersite.com`; el definitivo se cambia más adelante en `AUTH_URL`.
