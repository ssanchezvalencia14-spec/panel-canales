# Guía para el equipo

Esta guía es para quien trabaja en el panel todos los días: productores, revisores y admins de cada canal. También está dentro del panel, en **Ayuda**.

## Entrar

- Escribe tu correo en la pantalla de acceso y pulsa el enlace que te llega. Vence a los 15 minutos y sirve una sola vez.
- Solo entran los correos que un admin dio de alta. Si tu correo no tiene cuenta, la pantalla dice lo mismo, pero no llega nada: pídele acceso a un admin.
- Si pides muchos enlaces seguidos, el panel deja de enviar hasta que venzan los anteriores. Espera 15 minutos.
- La sesión dura 30 días. En un computador compartido, usa **Salir** al terminar.

## Roles

Cada persona tiene un rol **por canal**. Puedes ser productor en un canal y lector en otro, y solo ves los canales donde tienes rol.

| Puede… | Lector | Revisor | Productor | Admin |
|---|:-:|:-:|:-:|:-:|
| Ver el canal, sus videos, estadísticas e informes | ✓ | ✓ | ✓ | ✓ |
| Crear y editar videos, guiones, cifras y ejecuciones |  |  | ✓ | ✓ |
| Mover un video de estado |  | ✓ | ✓ | ✓ |
| Aprobar un video (firma) |  | ✓ |  | ✓ |
| Publicar y programar (YouTube, TikTok, Drive) |  |  |  | ✓ |
| Dar acceso al equipo y cambiar roles |  |  |  | ✓ |
| Configurar el canal, topes de gasto, Google, investigación |  |  |  | ✓ |

El **superadmin de la red** puede todo en todos los canales, crea canales nuevos y ve la **Auditoría**.

## El camino de un video

Idea → Guion → Verificación → Producción → Revisión → Aprobado → Programado → Publicado

- **No se saltan estados.** Siempre se puede volver atrás, salvo desde Publicado.
- **Para salir de Guion** el gancho necesita el puntaje objetivo del canal. Mejóralo y pulsa **Recalcular**. Si hay una razón de peso, un admin puede forzarlo, y queda registrado.
- **Para entrar a Producción** todas las cifras del video deben tener su fuente verificada. Si el video no tiene cifras de terceros, un revisor o admin lo declara.
- **Aprobado** exige la firma de un revisor o admin. Si el video vuelve atrás, la firma se retira.
- **Programado y Publicado** solo los hace un admin, con confirmación en pantalla.

Todo cambio queda en el **registro de actividad**, con quién y cuándo.

## Cifras y fuentes

- Toda cifra sobre personas o empresas reales necesita una fuente con enlace. Sin fuente, no se publica.
- En la ficha del video, sección **Cifras**: agrega la afirmación tal como sale en el guion y, al verificarla, pega el enlace de la fuente.
- El borrador de guion con IA marca las cifras como `[CIFRA: …]` y las agrega solas al checklist. **La IA no verifica:** verifica tú cada una.

## Producción

- **Borrador de guion con tu chat de IA** (sin API):
  1. En la ficha del video, abre **Borrador con tu chat de IA** y pulsa **Copiar**.
  2. Abre un chat nuevo en claude.ai (o la IA que uses), pega y espera la respuesta completa.
  3. Copia toda la respuesta, de `===GUION===` a `===FIN===`, pégala en el panel y pulsa **Guardar borrador del chat**. El guion queda como una versión nueva y sus cifras pasan al checklist.
  4. Si el panel dice que no encuentra las marcas, pídele al chat: «responde respetando exactamente el formato de marcas».
- **Borrador con la API:** si el admin configuró la clave de la API, aparece además el botón **Generar borrador con IA**.
- En los dos casos el borrador es un punto de partida: se revisa y se edita.
- **Ejecuciones:** todo lo que se hace fuera del panel (voz, imágenes, subtítulos, render en la PC) se registra con su costo y el enlace de salida en Drive. El panel no guarda archivos de video, solo enlaces.
- **Topes de gasto:** hay un tope por video y otro por mes para todo el canal. Si un registro o una llamada a la IA pasaría el tope, el panel no lo hace y lo avisa. Un admin puede subir el tope en **Ejecuciones**.
- **Marcar salida lista:** cuando el largo, los TikTok y los Shorts están en Drive, pega los enlaces y márcalo.

## Publicar

- **YouTube:** con el video Aprobado, un admin lo programa desde la ficha. Se sube privado a YouTube a mano y el panel lo programa a la hora del canal.
- **TikTok:** es manual y guiado. El panel da el texto de cada parte listo para copiar y un checklist. Al publicar, pega la URL de TikTok en el panel.
- En TikTok no hay enlaces en los comentarios: el enlace va solo en la bio.
- Cada paso que publica pide confirmación y avisa al equipo por correo.

## Informes y alertas

- **Alertas:** el panel avisa de videos atrasados, de falta de videos listos (colchón) y de cifras sin verificar. Las ves en **Informes** y en la vista **Red**.
- **Resumen semanal:** llega en borrador. Un admin lo revisa, lo edita si hace falta y lo envía al equipo.
- **Investigación de referencias:** un informe semanal con tendencias y enlaces. Un admin lo hace desde **Informes → Investigar con tu chat de IA**: copia las instrucciones, las pega en claude.ai con la búsqueda web activada y pega el informe en el panel. Es insumo para ideas, no datos verificados.

## Si algo falla

- Si un formulario muestra «Algo falló en el servidor (referencia ABC123)», vuelve a intentarlo. Si se repite, pásale esa **referencia** al admin: con ella encuentra el error en los registros.
- Si una página no carga, pulsa **Reintentar**.
- Si Google se desconecta («reconectar»), un admin vuelve a conectarlo en **Estadísticas → Integraciones**.
- Nunca compartas tu enlace de acceso: entra a tu cuenta.

## Buenas prácticas

- Un video, una ficha: todo (guion, cifras, enlaces, ejecuciones) vive en la ficha del video.
- Escribe en el registro lo que hiciste fuera del panel.
- Nada se publica sin aprobación humana, ni siquiera lo que generó la IA.
