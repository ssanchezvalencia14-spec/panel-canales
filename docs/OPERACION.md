# Operación del panel

Manual para quien mantiene el panel: despliegue, variables, tareas programadas, copias de seguridad, registros, costos e incidentes. Para el uso diario, ver [`GUIA_EQUIPO.md`](GUIA_EQUIPO.md).

## Mapa rápido

| Pieza | Dónde |
|---|---|
| App Next.js | Hostinger, sitio Node.js (dominio provisional `*.hostingersite.com`) |
| Base de datos | MySQL del mismo hosting; la app conecta por `127.0.0.1:3306` |
| Correo | SMTP de Hostinger (`smtp.hostinger.com:465`) |
| Código | Repositorio privado de GitHub |
| Copias de seguridad | `RESPALDOS_DIR` en el servidor (por defecto `~/respaldos-panel`) y descargas manuales |
| Estado general | **Auditoría** en el panel (solo superadmin) |

## Desplegar una versión nueva

1. Pasa las pruebas en local: `npm run typecheck && npm run lint && npm test && npm run test:integracion`.
2. Haz el commit y el push al repositorio.
3. Genera el zip desde el commit, sin archivos locales ni `.env`: `git archive HEAD --format=zip -o panel-src.zip`.
4. En Hostinger, sube el zip y compila con Node 24, `app_type: next` y `build_script: build:hostinger`. El build aplica las migraciones y el seed, que es idempotente.
5. **Nunca lances dos builds a la vez.** Al «Aplicar cambios» en las variables, hPanel ya lanza uno: espera a que termine.
6. Comprueba que el login abre, entra con tu cuenta y revisa **Auditoría**.

**Volver a la versión anterior:** genera el zip del commit anterior (`git archive <commit> …`) y despliégalo igual. Si la versión nueva traía una migración, revisa antes que la anterior funcione con el esquema nuevo: las migraciones solo agregan, así que normalmente sí.

## Variables de entorno

Se cargan en hPanel → sitio Node.js → Variables de entorno, **una por una**. El reemplazo por API borra las que no se envíen.

- Las obligatorias y su uso están en el README y en `.env.example`. **Auditoría** muestra cuáles faltan, sin enseñar valores.
- Las variables nuevas de la Fase 6 son opcionales:
  - `RESPALDOS_DIR`: carpeta de respaldos.
  - `RESPALDOS_MAX`: cuántos conservar (14 por defecto).
- Después de cambiar variables hay que compilar de nuevo, porque Next las lee en el build.

### Rotar secretos

| Secreto | Cómo rotarlo | Efecto |
|---|---|---|
| `AUTH_SECRET` | Pon uno nuevo y recompila | Todos vuelven a entrar con su correo |
| `CRON_SECRET` | Pon uno nuevo, recompila y actualiza las tareas cron | Ninguno, si actualizas el cron a la vez |
| `SMTP_PASSWORD` | Cambia la clave del buzón en hPanel y aquí | Ninguno |
| `GOOGLE_CLIENT_SECRET` | Genera uno nuevo en Google Cloud y recompila | Ninguno |
| `INTEGRACIONES_CLAVE` | Pon una nueva y **reconecta Google** en cada canal | Los permisos guardados dejan de servir |
| `ANTHROPIC_API_KEY` | Crea una clave nueva en la consola de Anthropic, cámbiala y borra la vieja | Ninguno |

Genera los secretos con `openssl rand -base64 32`. Ningún secreto va al repositorio, ni siquiera en `.env.example`.

## Tareas programadas (cron)

En hPanel → Avanzado → Tareas Cron. Todas llevan la cabecera `Authorization: Bearer <CRON_SECRET>`; sin ella responden 401.

| Tarea | Frecuencia sugerida | Qué hace |
|---|---|---|
| `/api/cron/respaldo` | Diaria, 03:00 | Copia de seguridad en `RESPALDOS_DIR` con rotación |
| `/api/cron/diario` | Diaria, 06:00 | Alertas de todos los canales y limpieza de sesiones y enlaces vencidos |
| `/api/cron/sincronizar` | Diaria, 05:00 | Métricas de YouTube y Google Calendar de cada canal conectado |
| `/api/cron/semanal` | Lunes, 07:00 | Resumen semanal en borrador e investigación de referencias |

Ejemplo:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/cron/respaldo
```

- Cada tarea responde un JSON con `ok` y el detalle por canal.
- Un canal con problemas no frena a los demás: queda con `ok: false` y el error en los registros.

## Copias de seguridad

**Qué se respalda:** todas las tablas del panel en un `.json.gz`, con usuarios, canales, videos, métricas, guiones, ejecuciones, actividad e informes.

**Qué no se respalda:**
- las sesiones y los enlaces de acceso pendientes, que se regeneran solos;
- el historial de migraciones, que lo recrea `migrate deploy`.

Los permisos de Google van cifrados: para usarlos tras restaurar hace falta la misma `INTEGRACIONES_CLAVE`.

Hay tres capas:

1. **Diaria automática** (`/api/cron/respaldo`), en el disco del hosting, fuera de la carpeta de la app para que un despliegue no la borre.
2. **Descarga manual**, en **Auditoría → Descargar respaldo ahora**. Hazla al menos una vez por semana y guárdala fuera de Hostinger (Drive de la empresa, por ejemplo). Si el hosting se pierde, es la única copia.
3. **Respaldos propios de Hostinger**, en hPanel → Archivos → Copias de seguridad. Incluyen la base MySQL y sirven de red extra, pero no se controlan desde el panel.

También desde la terminal, con `DATABASE_URL` apuntando a la base:

```bash
npm run respaldo
```

O a un archivo concreto:

```bash
npm run respaldo -- ruta/salida.json.gz
```

### Restaurar

La restauración **solo funciona sobre una base recién migrada y vacía**: se niega si encuentra usuarios o canales, para no pisar una base en uso.

1. Crea una base MySQL nueva en hPanel.
2. Aplica las migraciones:

   ```bash
   DATABASE_URL=<base nueva> npx prisma migrate deploy
   ```

3. Restaura el respaldo:

   ```bash
   DATABASE_URL=<base nueva> npm run restaurar -- respaldo-AAAAMMDD-HHMMSS.json.gz
   ```

4. Cambia `DATABASE_URL` del sitio a la base nueva y recompila. Para conservar Google conectado, usa la misma `INTEGRACIONES_CLAVE`.
5. Todos vuelven a entrar con su correo.

**Prueba la restauración** cada pocos meses con un respaldo real en una base de prueba. Un respaldo que nunca se restauró no está comprobado.

## Registros y errores

- El servidor escribe **una línea JSON por evento**, con `t`, `nivel`, `evento` y datos. Los valores con nombres como `password`, `token`, `secret` o `key` se ocultan siempre.
- Dónde verlos: hPanel → sitio Node.js → Registros, o los registros del build para los fallos de despliegue.
- **Referencia de error:**
  - Cuando una acción falla de forma inesperada, el usuario ve «referencia ABC123».
  - Busca `"ref":"ABC123"` en los registros para ver el error completo (evento `accion_fallida`).
  - En una página, la referencia es el `digest` de Next y aparece en los registros con ese mismo código.
- Eventos útiles para buscar:

| Evento | Qué significa |
|---|---|
| `accion_fallida` | Error inesperado en un formulario |
| `reintento` | Google, SMTP o la IA fallaron de forma pasajera y se repitió la llamada |
| `sincronizacion_fallida`, `sincronizacion_con_errores` | Problema con Google en un canal |
| `cron_diario_canal`, `cron_semanal_*` | Un canal falló dentro de una tarea programada |
| `respaldo_ok`, `respaldo_fallido` | Resultado de la copia diaria |
| `login_limite_enlaces` | Alguien pidió demasiados enlaces de acceso seguidos |
| `google_conectar_fallido` | Falló la conexión con Google |

**Reintentos automáticos:**
- **Google:** las lecturas y actualizaciones se repiten hasta 3 veces ante cortes de red, 429 o 5xx, con espera creciente y respetando `Retry-After`. Las creaciones (carpetas, documentos, eventos) no se repiten, para no duplicar.
- **Claude:** el SDK repite hasta 3 veces.
- **SMTP:** un reintento ante caída de conexión o rechazo temporal (4xx). Nunca ante un error de credenciales (535).

## Costos

- Todo gasto queda en **Ejecuciones**, con tipo, costo y log: los borradores de guion, la investigación y lo que el equipo registra a mano.
- **Topes**, todos comprobados **antes** de gastar:
  - **por video**, del canal o propio del video;
  - **por informe de investigación**, `limiteGastoInvestigacion`;
  - **mensual por canal**, `limiteGastoMensual`, que se fija en Ejecuciones.
- **Auditoría** muestra el gasto del mes de cada canal frente a su tope.
- Recomendado: fija un tope mensual en cada canal y, además, un límite de gasto en la consola de Anthropic. Es la última barrera si algo se descontrola.

## Seguridad

- El panel no se puede incrustar en otro sitio.
- Envía estas cabeceras:
  - `X-Frame-Options` y `frame-ancestors`;
  - `nosniff`;
  - `Referrer-Policy`;
  - `Permissions-Policy`;
  - HSTS.
- Permisos por rol, aplicados en el servidor tres veces:
  - en el **proxy**, por ruta;
  - en cada **server action**, que pide la sesión;
  - en la **capa de datos**, que comprueba el rol y filtra por canal.

  La prueba `tests/unit/auditoria-permisos.test.ts` falla si alguna puerta nueva queda sin control.
- Login:
  - solo correos dados de alta;
  - como máximo 3 enlaces vigentes por correo;
  - la misma pantalla exista o no la cuenta.
- Dependencias: ejecuta `npm audit --omit=dev` antes de cada despliegue.

## Incidentes frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| No llega el correo de acceso | SMTP mal configurado (error 535 en los registros) o el límite de 3 enlaces | Revisa usuario y clave del buzón en hPanel; espera 15 minutos |
| «No se pudo iniciar sesión» al abrir el enlace | El enlace venció o ya se usó | Pide uno nuevo |
| Google «reconectar» en un canal | Permiso revocado o app de Google en modo *Testing* (vence a los 7 días) | Reconecta; publica la app en Google Cloud |
| El cron responde 401 | `CRON_SECRET` distinto en la tarea y en el sitio | Iguala ambos |
| «Supera el tope…» | Se alcanzó un tope de gasto | Un admin revisa el gasto y sube el tope si corresponde |
| Build fallido en Hostinger | Dos builds a la vez o una variable faltante | Espera y relanza uno solo; mira el registro del build |
| Página «Algo falló al cargar» | Base de datos caída o un servicio externo | Reintenta; busca el `digest` en los registros |

## Altas y bajas de personas

- **Alta:** un admin la da de alta en **Equipo** del canal, con correo y rol. Para un superadmin, añade el correo a `datos/red.json` y despliega.
- **Baja:** quita a la persona de cada canal en **Equipo**. Para bloquearla del todo, desactívala:

  ```bash
  npm run usuario:crear -- --email x@y.com --inactivo
  ```

  Eso bloquea el acceso y cierra sus sesiones. Un usuario inactivo no entra aunque conserve una cookie. Para reactivarlo, usa `--activo`.
- Revisa **Auditoría** cada mes: usuarios sin canal, sesiones abiertas y roles.
